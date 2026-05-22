import { z } from "npm:zod@4";

const EnvSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean()]),
);

const CaseSchema = z.object({
  name: z.string().min(1),
  contextPath: z.string().optional(),
  dockerfilePath: z.string().default("Dockerfile"),
  imageTag: z.string().optional(),
  platform: z.string().optional(),
  target: z.string().optional(),
  buildArgs: z.record(z.string(), z.string()).default({}),
  noCache: z.boolean().default(false),
  pull: z.boolean().default(false),
  containerName: z.string().optional(),
  env: EnvSchema.default({}),
  ports: z.array(z.string()).default([]),
  volumes: z.array(z.string()).default([]),
  containerCommand: z.array(z.string()).default([]),
  healthCommand: z.string().optional(),
  startupTimeoutSeconds: z.number().int().positive().default(60),
  healthIntervalSeconds: z.number().int().positive().default(2),
});

const StepSchema = z.object({
  command: z.array(z.string()),
  exitCode: z.number().int(),
  stdout: z.string(),
  stderr: z.string(),
  durationMs: z.number().int().nonnegative(),
});

const CaseResultSchema = z.object({
  name: z.string(),
  status: z.enum(["passed", "failed"]),
  failurePhase: z.enum(["build", "run", "health", "inspect", "cleanup"])
    .optional(),
  imageTag: z.string(),
  containerName: z.string(),
  containerId: z.string().optional(),
  startedAt: z.string(),
  finishedAt: z.string(),
  build: StepSchema.optional(),
  run: StepSchema.optional(),
  health: StepSchema.optional(),
  inspect: StepSchema.optional(),
  cleanup: StepSchema.optional(),
  logs: z.string().optional(),
});

const SummarySchema = z.object({
  status: z.enum(["passed", "failed"]),
  total: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  cases: z.array(z.string()),
  failedCases: z.array(z.string()),
  startedAt: z.string(),
  finishedAt: z.string(),
});

type CaseInput = z.infer<typeof CaseSchema>;
type StepResult = z.infer<typeof StepSchema>;
type CaseResult = z.infer<typeof CaseResultSchema>;
type GlobalArgs = {
  dockerBinary?: string;
  defaultContextPath?: string;
  imageTagPrefix?: string;
  containerNamePrefix?: string;
  logTailLines?: number;
  failOnFailure?: boolean;
};
type TestMatrixArgs = {
  cases: CaseInput[];
};
type ModelContext = {
  globalArgs: GlobalArgs;
  writeResource: (
    specName: "summary" | "caseResult",
    name: string,
    content: unknown,
  ) => Promise<unknown>;
};

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(
    /^-+|-+$/g,
    "",
  ) ||
    "case";
}

function defaultImageTag(prefix: string, caseName: string): string {
  return `${prefix}:${slug(caseName)}`;
}

function defaultContainerName(prefix: string, caseName: string): string {
  return `${prefix}-${slug(caseName)}`;
}

async function runCommand(
  command: string[],
  timeoutSeconds?: number,
): Promise<StepResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = timeoutSeconds
    ? setTimeout(
      () => controller.abort("command timed out"),
      timeoutSeconds * 1000,
    )
    : undefined;

  try {
    const output = await new Deno.Command(command[0], {
      args: command.slice(1),
      stdout: "piped",
      stderr: "piped",
      signal: controller.signal,
    }).output();

    return {
      command,
      exitCode: output.code,
      stdout: new TextDecoder().decode(output.stdout),
      stderr: new TextDecoder().decode(output.stderr),
      durationMs: Date.now() - started,
    };
  } catch (error) {
    return {
      command,
      exitCode: 124,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - started,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function buildArgs(
  docker: string,
  imageTag: string,
  testCase: CaseInput,
): string[] {
  const args = ["build", "-t", imageTag, "-f", testCase.dockerfilePath];
  if (testCase.platform) args.push("--platform", testCase.platform);
  if (testCase.target) args.push("--target", testCase.target);
  if (testCase.noCache) args.push("--no-cache");
  if (testCase.pull) args.push("--pull");
  for (const [key, value] of Object.entries(testCase.buildArgs)) {
    args.push("--build-arg", `${key}=${value}`);
  }
  args.push(testCase.contextPath ?? ".");
  return [docker, ...args];
}

function runArgs(
  docker: string,
  imageTag: string,
  containerName: string,
  testCase: CaseInput,
): string[] {
  const args = ["run", "-d", "--name", containerName];
  for (const [key, value] of Object.entries(testCase.env)) {
    args.push("-e", `${key}=${value}`);
  }
  for (const port of testCase.ports) args.push("-p", port);
  for (const volume of testCase.volumes) args.push("-v", volume);
  args.push(imageTag, ...testCase.containerCommand);
  return [docker, ...args];
}

async function dockerLogs(
  docker: string,
  containerName: string,
  tailLines: number,
): Promise<string> {
  const result = await runCommand([
    docker,
    "logs",
    "--tail",
    String(tailLines),
    containerName,
  ]);
  return [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
}

async function cleanupContainer(
  docker: string,
  containerName: string,
): Promise<StepResult> {
  return await runCommand([docker, "rm", "-f", containerName]);
}

async function waitForHealth(
  docker: string,
  containerName: string,
  healthCommand: string | undefined,
  timeoutSeconds: number,
  intervalSeconds: number,
): Promise<StepResult | undefined> {
  if (!healthCommand) return undefined;

  const deadline = Date.now() + timeoutSeconds * 1000;
  let last: StepResult | undefined;
  while (Date.now() <= deadline) {
    last = await runCommand([
      docker,
      "exec",
      containerName,
      "sh",
      "-c",
      healthCommand,
    ]);
    if (last.exitCode === 0) return last;
    await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1000));
  }
  return last;
}

/**
 * Local Docker image testing model.
 *
 * The model treats image testing as a typed matrix operation rather than a
 * generic command runner: each case is built, run, health-checked, inspected,
 * logged, and cleaned up with structured resources written for downstream
 * workflows and reports.
 */
export const model = {
  type: "@alvagante/docker-image-test/runner",
  version: "2026.05.20.7",
  globalArguments: z.object({
    dockerBinary: z.string().default("docker"),
    defaultContextPath: z.string().default("."),
    imageTagPrefix: z.string().default("swamp/docker-image-test"),
    containerNamePrefix: z.string().default("swamp-docker-image-test"),
    logTailLines: z.number().int().positive().default(200),
    failOnFailure: z.boolean().default(true),
  }),
  resources: {
    summary: {
      description: "Docker image test matrix summary",
      schema: SummarySchema,
      lifetime: "infinite",
      garbageCollection: 20,
    },
    caseResult: {
      description: "Per-image Docker test result",
      schema: CaseResultSchema,
      lifetime: "infinite",
      garbageCollection: 20,
    },
  },
  methods: {
    testMatrix: {
      description:
        "Build, run, health-check, inspect, and clean up local Docker image test cases",
      arguments: z.object({
        cases: z.array(CaseSchema).min(1),
      }),
      execute: async (args: TestMatrixArgs, context: ModelContext) => {
        const globalArgs = context.globalArgs;
        const docker = globalArgs.dockerBinary ?? "docker";
        const startedAt = new Date().toISOString();
        const handles = [];
        const results: CaseResult[] = [];

        for (const rawCase of args.cases) {
          const testCase = CaseSchema.parse({
            contextPath: globalArgs.defaultContextPath ?? ".",
            ...rawCase,
          });
          const imageTag = testCase.imageTag ??
            defaultImageTag(
              globalArgs.imageTagPrefix ?? "swamp/docker-image-test",
              testCase.name,
            );
          const containerName = testCase.containerName ??
            defaultContainerName(
              globalArgs.containerNamePrefix ?? "swamp-docker-image-test",
              testCase.name,
            );
          const caseStartedAt = new Date().toISOString();
          const result: CaseResult = {
            name: testCase.name,
            status: "failed",
            imageTag,
            containerName,
            startedAt: caseStartedAt,
            finishedAt: caseStartedAt,
          };

          try {
            result.cleanup = await cleanupContainer(docker, containerName);

            result.build = await runCommand(
              buildArgs(docker, imageTag, testCase),
            );
            if (result.build.exitCode !== 0) {
              result.failurePhase = "build";
              continue;
            }

            result.run = await runCommand(
              runArgs(docker, imageTag, containerName, testCase),
            );
            if (result.run.exitCode !== 0) {
              result.failurePhase = "run";
              continue;
            }
            result.containerId = result.run.stdout.trim();

            result.health = await waitForHealth(
              docker,
              containerName,
              testCase.healthCommand,
              testCase.startupTimeoutSeconds,
              testCase.healthIntervalSeconds,
            );
            if (result.health && result.health.exitCode !== 0) {
              result.failurePhase = "health";
              continue;
            }

            result.inspect = await runCommand([
              docker,
              "inspect",
              containerName,
            ]);
            if (result.inspect.exitCode !== 0) {
              result.failurePhase = "inspect";
              continue;
            }

            result.status = "passed";
          } finally {
            result.logs = await dockerLogs(
              docker,
              containerName,
              globalArgs.logTailLines ?? 200,
            );
            result.cleanup = await cleanupContainer(docker, containerName);
            result.finishedAt = new Date().toISOString();

            const handle = await context.writeResource(
              "caseResult",
              `case-${slug(testCase.name)}`,
              result,
            );
            handles.push(handle);
            results.push(result);
          }
        }

        const failedCases = results.filter((result) =>
          result.status === "failed"
        ).map((result) => result.name);
        const summary = {
          status: failedCases.length === 0
            ? "passed" as const
            : "failed" as const,
          total: results.length,
          passed: results.length - failedCases.length,
          failed: failedCases.length,
          cases: results.map((result) => result.name),
          failedCases,
          startedAt,
          finishedAt: new Date().toISOString(),
        };
        handles.push(
          await context.writeResource("summary", "summary", summary),
        );

        if (summary.status === "failed" && (globalArgs.failOnFailure ?? true)) {
          throw new Error(
            `Docker image test failed: ${failedCases.join(", ")}`,
          );
        }

        return { dataHandles: handles };
      },
    },
  },
};

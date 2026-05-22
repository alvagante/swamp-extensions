import { z } from "npm:zod@4";

const SeveritySchema = z.enum(["info", "warn", "critical"]);
const StatusSchema = z.enum(["pass", "warn", "fail", "unknown"]);
const PrivilegedModeSchema = z.enum(["skip", "prompt", "run"]);
const DetailModeSchema = z.enum(["summary", "findings", "all"]);

const CommandResultSchema = z.object({
  command: z.string(),
  args: z.array(z.string()),
  ok: z.boolean(),
  code: z.number().nullable(),
  stdout: z.string(),
  stderr: z.string(),
  durationMs: z.number(),
  timedOut: z.boolean(),
});

const FindingSchema = z.object({
  id: z.string(),
  severity: SeveritySchema,
  category: z.string(),
  title: z.string(),
  detail: z.string(),
  recommendation: z.string().optional(),
});

const CheckSchema = z.object({
  status: StatusSchema,
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  detail: z.string().optional(),
});

const SnapshotSchema = z.object({
  collectedAt: z.string(),
  platform: z.object({
    os: z.string(),
    arch: z.string(),
  }),
  host: z.object({
    hostname: z.string().nullable(),
  }),
  os: z.object({
    productName: z.string().nullable(),
    productVersion: z.string().nullable(),
    buildVersion: z.string().nullable(),
    kernelRelease: z.string().nullable(),
  }),
  hardware: z.object({
    model: z.string().nullable(),
    cpu: z.string().nullable(),
    memoryBytes: z.number().nullable(),
  }),
  security: z.record(z.string(), CheckSchema),
  updates: z.record(z.string(), CheckSchema),
  performance: z.object({
    rootDiskUsedPercent: z.number().nullable(),
    memoryFreePercent: z.number().nullable(),
    loadAverage1m: z.number().nullable(),
    loadAverage5m: z.number().nullable(),
    loadAverage15m: z.number().nullable(),
    topProcesses: z.array(z.object({
      pid: z.number(),
      ppid: z.number().nullable(),
      cpuPercent: z.number(),
      memoryPercent: z.number(),
      command: z.string(),
    })),
  }),
  network: z.object({
    listeners: z.array(z.object({
      command: z.string(),
      pid: z.number().nullable(),
      user: z.string().nullable(),
      address: z.string(),
    })),
  }),
  launchd: z.object({
    scannedDirectories: z.array(z.string()),
    plistCount: z.number(),
    writablePlists: z.array(z.object({
      path: z.string(),
      mode: z.string(),
    })),
    unreadableDirectories: z.array(z.string()),
  }),
  homebrew: z.object({
    present: z.boolean(),
    version: z.string().nullable(),
    outdatedFormulae: z.number().nullable(),
    outdatedCasks: z.number().nullable(),
    error: z.string().nullable(),
  }),
  path: z.object({
    raw: z.string().nullable(),
    directories: z.array(z.object({
      index: z.number(),
      path: z.string(),
      exists: z.boolean(),
      standard: z.boolean(),
      relative: z.boolean(),
      mode: z.string().nullable(),
      groupOrWorldWritable: z.boolean(),
      commandCount: z.number(),
      shadowedSystemCommands: z.array(z.string()),
    })),
    duplicateDirectories: z.array(z.string()),
  }),
  safeguards: z.object({
    npm: z.object({
      present: z.boolean(),
      path: z.string().nullable(),
      audit: CheckSchema,
      ignoreScripts: CheckSchema,
      packageLock: CheckSchema,
    }),
    socket: z.object({
      present: z.boolean(),
      path: z.string().nullable(),
    }),
    deno: z.object({
      present: z.boolean(),
      path: z.string().nullable(),
      version: z.string().nullable(),
    }),
    pipx: z.object({
      present: z.boolean(),
      path: z.string().nullable(),
    }),
  }),
  recommendations: z.array(z.object({
    name: z.string(),
    category: z.string(),
    installed: z.boolean(),
    detectedPath: z.string().nullable(),
    installHint: z.string(),
    url: z.string(),
    rationale: z.string(),
  })),
  management: z.object({
    enrollment: CheckSchema,
    profiles: z.object({
      readable: z.boolean(),
      count: z.number(),
      error: z.string().nullable(),
    }),
  }),
  systemExtensions: z.object({
    readable: z.boolean(),
    count: z.number(),
    entries: z.array(z.object({
      raw: z.string(),
      teamId: z.string().nullable(),
      bundleId: z.string().nullable(),
      state: z.string().nullable(),
      category: z.string(),
    })),
    error: z.string().nullable(),
  }),
  persistence: z.object({
    backgroundItems: z.object({
      readable: z.boolean(),
      count: z.number(),
      error: z.string().nullable(),
    }),
  }),
  tcc: z.object({
    readable: z.boolean(),
    database: z.string().nullable(),
    grantsByService: z.record(z.string(), z.number()),
    error: z.string().nullable(),
  }),
  ssh: z.object({
    directory: z.object({
      path: z.string().nullable(),
      exists: z.boolean(),
      mode: z.string().nullable(),
      ok: z.boolean(),
    }),
    config: z.object({
      exists: z.boolean(),
      mode: z.string().nullable(),
      ok: z.boolean(),
    }),
    privateKeys: z.array(z.object({
      path: z.string(),
      mode: z.string().nullable(),
      ok: z.boolean(),
    })),
    agentKeys: z.number().nullable(),
  }),
  homebrewSecurity: z.object({
    taps: z.array(z.object({
      name: z.string(),
      official: z.boolean(),
    })),
    nonOfficialTaps: z.array(z.string()),
    services: z.array(z.object({
      name: z.string(),
      status: z.string(),
      file: z.string().nullable(),
    })),
  }),
  ecosystems: z.object({
    npmRegistry: CheckSchema,
    pipIndexUrl: CheckSchema,
    cargoConfig: CheckSchema,
    gemSources: CheckSchema,
    goChecksum: CheckSchema,
  }),
  browsers: z.object({
    profiles: z.array(z.object({
      browser: z.string(),
      profile: z.string(),
      extensionCount: z.number(),
      unpackedCount: z.number(),
      extensions: z.array(z.object({
        id: z.string(),
        name: z.string().nullable(),
        version: z.string().nullable(),
        source: z.string(),
      })),
    })),
  }),
  applications: z.object({
    enabled: z.boolean(),
    scanned: z.number(),
    unsigned: z.array(z.string()),
    rejected: z.array(z.string()),
    quarantined: z.array(z.string()),
    errors: z.array(z.string()),
  }),
  secrets: z.object({
    checked: z.array(z.object({
      path: z.string(),
      exists: z.boolean(),
      mode: z.string().nullable(),
      ok: z.boolean(),
      kind: z.string(),
    })),
  }),
  findings: z.array(FindingSchema),
  summary: z.object({
    critical: z.number(),
    warn: z.number(),
    info: z.number(),
  }),
  commands: z.array(CommandResultSchema),
  privileged: z.object({
    mode: PrivilegedModeSchema,
    approved: z.boolean(),
    reason: z.string(),
    commands: z.array(z.string()),
    interactive: z.boolean(),
  }),
});

const CheckArgsSchema = z.object({
  includeHomebrew: z.boolean().default(true),
  includeListeners: z.boolean().default(true),
  includeLaunchd: z.boolean().default(true),
  includeApplications: z.boolean().default(false),
  includeSoftwareUpdateList: z.boolean().default(false),
  includeCommandOutput: z.boolean().default(false),
  privilegedMode: PrivilegedModeSchema.default("skip"),
  detailMode: DetailModeSchema.default("all"),
  commandTimeoutMs: z.number().int().min(1000).max(60000).default(8000),
});

type Severity = z.infer<typeof SeveritySchema>;
type Finding = z.infer<typeof FindingSchema>;
type Check = z.infer<typeof CheckSchema>;
type CheckArgs = z.infer<typeof CheckArgsSchema>;
type CommandResult = z.infer<typeof CommandResultSchema>;
type PrivilegedMode = z.infer<typeof PrivilegedModeSchema>;

type RunState = {
  timeoutMs: number;
  includeCommandOutput: boolean;
  commands: CommandResult[];
};

type ModelContext = {
  logger?: {
    info: (message: string, fields?: Record<string, unknown>) => void;
  };
  writeResource: (
    specName: string,
    instanceName: string,
    data: unknown,
    overrides?: { tags?: Record<string, string> },
  ) => Promise<unknown>;
};

type PrivilegedCommand = {
  id: "fileVault" | "remoteLogin" | "remoteAppleEvents";
  label: string;
  command: string;
  args: string[];
};

type PrivilegedDecision = {
  mode: PrivilegedMode;
  approved: boolean;
  reason: string;
  commands: string[];
  interactive: boolean;
};

const PRIVILEGED_COMMANDS: PrivilegedCommand[] = [
  {
    id: "fileVault",
    label: "Read FileVault status",
    command: "/usr/bin/fdesetup",
    args: ["status"],
  },
  {
    id: "remoteLogin",
    label: "Read Remote Login status",
    command: "/usr/sbin/systemsetup",
    args: ["-getremotelogin"],
  },
  {
    id: "remoteAppleEvents",
    label: "Read Remote Apple Events status",
    command: "/usr/sbin/systemsetup",
    args: ["-getremoteappleevents"],
  },
];

function trimOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseNumber(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function check(
  status: Check["status"],
  value: Check["value"],
  detail?: string,
): Check {
  return { status, value, detail };
}

function finding(
  id: string,
  severity: Severity,
  category: string,
  title: string,
  detail: string,
  recommendation?: string,
): Finding {
  return { id, severity, category, title, detail, recommendation };
}

async function runCommand(
  state: RunState,
  command: string,
  args: string[] = [],
  timeoutMs = state.timeoutMs,
): Promise<CommandResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const output = await new Deno.Command(command, {
      args,
      stdout: "piped",
      stderr: "piped",
      signal: controller.signal,
    }).output();
    const stdout = new TextDecoder().decode(output.stdout);
    const stderr = new TextDecoder().decode(output.stderr);
    const result = {
      command,
      args,
      ok: output.success,
      code: output.code,
      stdout,
      stderr,
      durationMs: Date.now() - started,
      timedOut: false,
    };
    state.commands.push({
      ...result,
      stdout: state.includeCommandOutput && stdout ? stdout : "",
      stderr: state.includeCommandOutput && stderr ? stderr : "",
    });
    return result;
  } catch (error) {
    const timedOut = error instanceof DOMException &&
      error.name === "AbortError";
    const result = {
      command,
      args,
      ok: false,
      code: null,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - started,
      timedOut,
    };
    state.commands.push({
      ...result,
      stderr: state.includeCommandOutput ? result.stderr : "",
    });
    return result;
  } finally {
    clearTimeout(timer);
  }
}

async function runInteractiveCommand(
  state: RunState,
  command: string,
  args: string[] = [],
  timeoutMs = state.timeoutMs,
): Promise<CommandResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const output = await new Deno.Command(command, {
      args,
      stdin: "inherit",
      stdout: "piped",
      stderr: "inherit",
      signal: controller.signal,
    }).output();
    const stdout = new TextDecoder().decode(output.stdout);
    const result = {
      command,
      args,
      ok: output.success,
      code: output.code,
      stdout,
      stderr: "",
      durationMs: Date.now() - started,
      timedOut: false,
    };
    state.commands.push({
      ...result,
      stdout: state.includeCommandOutput && stdout ? stdout : "",
    });
    return result;
  } catch (error) {
    const timedOut = error instanceof DOMException &&
      error.name === "AbortError";
    const result = {
      command,
      args,
      ok: false,
      code: null,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - started,
      timedOut,
    };
    state.commands.push({
      ...result,
      stderr: state.includeCommandOutput ? result.stderr : "",
    });
    return result;
  } finally {
    clearTimeout(timer);
  }
}

async function commandText(
  state: RunState,
  command: string,
  args: string[] = [],
  timeoutMs?: number,
): Promise<string | null> {
  const result = await runCommand(state, command, args, timeoutMs);
  return result.ok ? trimOrNull(result.stdout) : null;
}

function commandOutput(result: CommandResult): string {
  return trimOrNull(result.stdout) ?? trimOrNull(result.stderr) ?? "";
}

function latestPackageMatch(
  packages: string,
  prefixes: readonly string[],
): string | null {
  const matches = packages.split("\n")
    .map((line) => line.trim())
    .filter((line) =>
      prefixes.some((prefix) =>
        line === prefix || line.startsWith(`${prefix}.`) ||
        line.startsWith(`${prefix}_`)
      )
    )
    .toSorted((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
    );
  return matches.at(-1) ?? null;
}

async function packageInfo(
  state: RunState,
  canonicalPackage: string,
  alternatePrefixes: readonly string[] = [],
): Promise<{ packageId: string; output: string } | null> {
  const exact = await commandText(state, "/usr/sbin/pkgutil", [
    "--pkg-info",
    canonicalPackage,
  ]);
  if (exact) {
    return { packageId: canonicalPackage, output: exact };
  }

  const packages = await commandText(state, "/usr/sbin/pkgutil", ["--pkgs"]);
  if (!packages) {
    return null;
  }

  const packageId = latestPackageMatch(packages, [
    canonicalPackage,
    ...alternatePrefixes,
  ]);
  if (!packageId) {
    return null;
  }

  const output = await commandText(state, "/usr/sbin/pkgutil", [
    "--pkg-info",
    packageId,
  ]);
  return output ? { packageId, output } : null;
}

function formatCommand(command: string, args: string[] = []): string {
  return [command, ...args].map((part) =>
    /^[A-Za-z0-9_/:=.,@%+-]+$/.test(part) ? part : JSON.stringify(part)
  ).join(" ");
}

function privilegedInvocation(command: PrivilegedCommand): string {
  return formatCommand("/usr/bin/sudo", [command.command, ...command.args]);
}

function nonInteractivePrivilegedInvocation(
  command: PrivilegedCommand,
): string {
  return formatCommand("/usr/bin/sudo", [
    "-n",
    command.command,
    ...command.args,
  ]);
}

function resolvePrivilegedDecision(mode: PrivilegedMode): PrivilegedDecision {
  if (mode === "skip") {
    return {
      mode,
      approved: false,
      reason: "privilegedMode=skip",
      commands: [],
      interactive: false,
    };
  }

  if (mode === "run") {
    const commands = PRIVILEGED_COMMANDS.map(
      nonInteractivePrivilegedInvocation,
    );
    return {
      mode,
      approved: true,
      reason: "privilegedMode=run",
      commands,
      interactive: false,
    };
  }

  const commands = PRIVILEGED_COMMANDS.map(privilegedInvocation);
  const promptText = [
    "macOS Doctor can run these privileged read-only probes:",
    ...PRIVILEGED_COMMANDS.map((command) =>
      `  - ${command.label}: ${privilegedInvocation(command)}`
    ),
    "Run them now? sudo may ask for your password in this terminal.",
  ].join("\n");

  try {
    const approved = confirm(promptText);
    return {
      mode,
      approved,
      reason: approved ? "user approved prompt" : "user declined prompt",
      commands,
      interactive: approved,
    };
  } catch (error) {
    return {
      mode,
      approved: false,
      reason: `prompt unavailable: ${
        error instanceof Error ? error.message : String(error)
      }`,
      commands,
      interactive: false,
    };
  }
}

async function privilegedCommandText(
  state: RunState,
  decision: PrivilegedDecision,
  command: PrivilegedCommand,
): Promise<string | null> {
  if (!decision.approved) {
    return null;
  }

  const args = decision.interactive
    ? [command.command, ...command.args]
    : ["-n", command.command, ...command.args];
  const result = decision.interactive
    ? await runInteractiveCommand(state, "/usr/bin/sudo", args)
    : await runCommand(state, "/usr/bin/sudo", args);
  return result.ok ? trimOrNull(result.stdout) : null;
}

async function collectSecurity(
  state: RunState,
  findings: Finding[],
  privileged: PrivilegedDecision,
): Promise<Record<string, Check>> {
  const security: Record<string, Check> = {};

  const fileVault = await privilegedCommandText(
    state,
    privileged,
    PRIVILEGED_COMMANDS[0],
  ) ?? await commandText(state, "/usr/bin/fdesetup", ["status"]);
  if (fileVault?.includes("FileVault is On")) {
    security.fileVault = check("pass", true, fileVault);
  } else if (fileVault) {
    security.fileVault = check("fail", false, fileVault);
    findings.push(finding(
      "filevault-disabled",
      "critical",
      "security",
      "FileVault is not enabled",
      fileVault,
      "Enable FileVault for full-disk encryption.",
    ));
  } else {
    security.fileVault = check(
      "unknown",
      null,
      privileged.approved
        ? "Could not read FileVault status with privileged or unprivileged probe."
        : "Could not read FileVault status. Re-run with privilegedMode=prompt for an interactive sudo probe or privilegedMode=run for sudo -n.",
    );
  }

  const sip = await commandText(state, "/usr/bin/csrutil", ["status"]);
  if (sip?.toLowerCase().includes("enabled")) {
    security.systemIntegrityProtection = check("pass", true, sip);
  } else if (sip) {
    security.systemIntegrityProtection = check("fail", false, sip);
    findings.push(finding(
      "sip-disabled",
      "critical",
      "security",
      "System Integrity Protection is not enabled",
      sip,
      "Re-enable SIP from macOS Recovery unless this is an intentional lab host.",
    ));
  } else {
    security.systemIntegrityProtection = check(
      "unknown",
      null,
      "Could not read SIP status.",
    );
  }

  const gatekeeper = await commandText(state, "/usr/sbin/spctl", ["--status"]);
  if (gatekeeper?.includes("assessments enabled")) {
    security.gatekeeper = check("pass", true, gatekeeper);
  } else if (gatekeeper) {
    security.gatekeeper = check("fail", false, gatekeeper);
    findings.push(finding(
      "gatekeeper-disabled",
      "critical",
      "security",
      "Gatekeeper assessments are disabled",
      gatekeeper,
      "Re-enable Gatekeeper with spctl after confirming local policy.",
    ));
  } else {
    security.gatekeeper = check(
      "unknown",
      null,
      "Could not read Gatekeeper status.",
    );
  }

  const firewallResult = await runCommand(
    state,
    "/usr/libexec/ApplicationFirewall/socketfilterfw",
    ["--getglobalstate"],
  );
  const firewall = commandOutput(firewallResult);
  if (firewall.includes("enabled")) {
    security.firewall = check("pass", true, firewall);
  } else if (firewall.includes("disabled")) {
    security.firewall = check("warn", false, firewall);
    findings.push(finding(
      "firewall-disabled",
      "warn",
      "security",
      "Application firewall is disabled",
      firewall,
      "Enable the firewall unless another endpoint policy intentionally controls it.",
    ));
  } else {
    security.firewall = check(
      "unknown",
      null,
      "Could not read firewall globalstate.",
    );
  }

  const remoteLogin = await privilegedCommandText(
    state,
    privileged,
    PRIVILEGED_COMMANDS[1],
  ) ?? await commandText(state, "/usr/sbin/systemsetup", [
    "-getremotelogin",
  ]);
  if (remoteLogin?.includes("Off")) {
    security.remoteLogin = check("pass", false, remoteLogin);
  } else if (remoteLogin?.includes("On")) {
    security.remoteLogin = check("warn", true, remoteLogin);
    findings.push(finding(
      "remote-login-enabled",
      "warn",
      "security",
      "Remote Login is enabled",
      remoteLogin,
      "Confirm SSH exposure is intentional and access is restricted.",
    ));
  } else {
    security.remoteLogin = check(
      "unknown",
      null,
      privileged.approved
        ? "Could not read Remote Login status with privileged or unprivileged probe."
        : "Could not read Remote Login status. Re-run with privilegedMode=prompt for an interactive sudo probe or privilegedMode=run for sudo -n.",
    );
  }

  const remoteAppleEvents = await privilegedCommandText(
    state,
    privileged,
    PRIVILEGED_COMMANDS[2],
  ) ?? await commandText(state, "/usr/sbin/systemsetup", [
    "-getremoteappleevents",
  ]);
  if (remoteAppleEvents?.includes("Off")) {
    security.remoteAppleEvents = check("pass", false, remoteAppleEvents);
  } else if (remoteAppleEvents?.includes("On")) {
    security.remoteAppleEvents = check("warn", true, remoteAppleEvents);
    findings.push(finding(
      "remote-apple-events-enabled",
      "warn",
      "security",
      "Remote Apple Events are enabled",
      remoteAppleEvents,
      "Disable Remote Apple Events unless this host explicitly needs remote automation.",
    ));
  } else {
    security.remoteAppleEvents = check(
      "unknown",
      null,
      privileged.approved
        ? "Could not read Remote Apple Events status with privileged or unprivileged probe."
        : "Could not read Remote Apple Events status. Re-run with privilegedMode=prompt for an interactive sudo probe or privilegedMode=run for sudo -n.",
    );
  }

  return security;
}

async function collectUpdates(
  state: RunState,
  findings: Finding[],
  includeSoftwareUpdateList: boolean,
): Promise<Record<string, Check>> {
  const updates: Record<string, Check> = {};

  for (
    const [key, pkg, alternates] of [
      ["xprotect", "com.apple.pkg.XProtectPlistConfigData", []],
      [
        "gatekeeperConfig",
        "com.apple.pkg.GatekeeperConfigData",
        ["com.apple.pkg.GatekeeperCompatibilityData"],
      ],
    ] as const
  ) {
    const info = await packageInfo(state, pkg, alternates);
    updates[key] = info
      ? check(
        "pass",
        true,
        [
          `package: ${info.packageId}`,
          info.output.split("\n").find((line) => line.startsWith("version:")),
        ].filter(Boolean).join(", "),
      )
      : check("unknown", null, `Could not read package metadata for ${pkg}.`);
  }

  for (
    const pref of [
      "AutomaticCheckEnabled",
      "AutomaticDownload",
      "AutomaticallyInstallMacOSUpdates",
      "CriticalUpdateInstall",
      "ConfigDataInstall",
    ]
  ) {
    const value = await commandText(state, "/usr/bin/defaults", [
      "read",
      "/Library/Preferences/com.apple.SoftwareUpdate",
      pref,
    ]);
    if (value === null && pref === "AutomaticCheckEnabled") {
      const schedule = await commandText(state, "/usr/sbin/softwareupdate", [
        "--schedule",
      ]);
      const scheduleDetail = schedule ?? "";
      const scheduleStatus = schedule?.toLowerCase();
      if (scheduleStatus?.includes("turned on")) {
        updates[pref] = check("pass", true, scheduleDetail);
        continue;
      }
      if (scheduleStatus?.includes("turned off")) {
        updates[pref] = check("warn", false, scheduleDetail);
        findings.push(finding(
          "software-update-automatic-check-disabled",
          "warn",
          "updates",
          "Automatic update checks are disabled",
          scheduleDetail,
          "Enable automatic update checks unless MDM owns this policy.",
        ));
        continue;
      }
    }
    const enabled = value === "1";
    updates[pref] = value === null
      ? check(
        "unknown",
        null,
        `Could not read Software Update preference ${pref}.`,
      )
      : check(enabled ? "pass" : "warn", enabled, `${pref}=${value}`);
    if (
      value === "0" &&
      (pref === "CriticalUpdateInstall" || pref === "ConfigDataInstall")
    ) {
      findings.push(finding(
        `software-update-${pref.toLowerCase()}-disabled`,
        "warn",
        "updates",
        `${pref} is disabled`,
        `Software Update preference ${pref} is 0.`,
        "Enable automatic installation of critical and configuration data updates unless MDM owns this policy.",
      ));
    }
  }

  if (includeSoftwareUpdateList) {
    const list = await commandText(state, "/usr/sbin/softwareupdate", [
      "--list",
    ], Math.max(state.timeoutMs, 30000));
    updates.availableUpdates = list
      ? check(
        list.includes("No new software available") ? "pass" : "warn",
        list,
        list,
      )
      : check("unknown", null, "Could not list software updates.");
  }

  return updates;
}

async function collectPerformance(
  state: RunState,
  findings: Finding[],
): Promise<z.infer<typeof SnapshotSchema>["performance"]> {
  const df = await commandText(state, "/bin/df", ["-k", "-P", "/"]);
  const rootDiskUsedPercent = parseDfUsedPercent(df);
  if (rootDiskUsedPercent !== null && rootDiskUsedPercent >= 95) {
    findings.push(finding(
      "root-disk-critical",
      "critical",
      "performance",
      "Root filesystem is critically full",
      `Root filesystem is ${rootDiskUsedPercent}% used.`,
      "Free disk space before running large builds, updates, or VM/container workloads.",
    ));
  } else if (rootDiskUsedPercent !== null && rootDiskUsedPercent >= 85) {
    findings.push(finding(
      "root-disk-high",
      "warn",
      "performance",
      "Root filesystem usage is high",
      `Root filesystem is ${rootDiskUsedPercent}% used.`,
      "Review large directories, caches, container images, and old artifacts.",
    ));
  }

  const memoryPressure = await commandText(state, "/usr/bin/memory_pressure");
  const memoryFreePercent = parseMemoryFreePercent(memoryPressure);
  if (memoryFreePercent !== null && memoryFreePercent < 5) {
    findings.push(finding(
      "memory-pressure-high",
      "warn",
      "performance",
      "Available memory is very low",
      `memory_pressure reports ${memoryFreePercent}% free memory.`,
      "Inspect top memory consumers and background agents.",
    ));
  }

  const uptime = await commandText(state, "/usr/bin/uptime");
  const [loadAverage1m, loadAverage5m, loadAverage15m] = parseLoadAverage(
    uptime,
  );

  const ps = await commandText(state, "/bin/ps", [
    "-axo",
    "pid,ppid,pcpu,pmem,comm",
    "-r",
  ]);
  const topProcesses = parseProcesses(ps).slice(0, 10);

  return {
    rootDiskUsedPercent,
    memoryFreePercent,
    loadAverage1m,
    loadAverage5m,
    loadAverage15m,
    topProcesses,
  };
}

function parseDfUsedPercent(output: string | null): number | null {
  if (!output) return null;
  const lines = output.trim().split("\n");
  if (lines.length < 2) return null;
  const parts = lines[1].trim().split(/\s+/);
  const percent = parts[4]?.replace("%", "");
  return parseNumber(percent);
}

function parseMemoryFreePercent(output: string | null): number | null {
  if (!output) return null;
  const match = output.match(/System-wide memory free percentage:\s*(\d+)%/);
  return match ? parseNumber(match[1]) : null;
}

function parseLoadAverage(
  output: string | null,
): [number | null, number | null, number | null] {
  if (!output) return [null, null, null];
  const loadPart = output.includes("load averages:")
    ? output.split("load averages:").at(1)
    : output;
  const values = [...(loadPart ?? "").matchAll(/(\d+(?:\.\d+)?)/g)].map((
    match,
  ) => Number(match[1]));
  return [
    Number.isFinite(values[0]) ? values[0] : null,
    Number.isFinite(values[1]) ? values[1] : null,
    Number.isFinite(values[2]) ? values[2] : null,
  ];
}

function parseProcesses(output: string | null): Array<{
  pid: number;
  ppid: number | null;
  cpuPercent: number;
  memoryPercent: number;
  command: string;
}> {
  if (!output) return [];
  const [, ...lines] = output.trim().split("\n");
  return lines.flatMap((line) => {
    const match = line.trim().match(
      /^(\d+)\s+(\d+)\s+([\d.]+)\s+([\d.]+)\s+(.+)$/,
    );
    if (!match) return [];
    return [{
      pid: Number(match[1]),
      ppid: Number(match[2]),
      cpuPercent: Number(match[3]),
      memoryPercent: Number(match[4]),
      command: match[5],
    }];
  });
}

async function collectNetwork(
  state: RunState,
  includeListeners: boolean,
): Promise<z.infer<typeof SnapshotSchema>["network"]> {
  if (!includeListeners) {
    return { listeners: [] };
  }

  const lsof = await commandText(state, "/usr/sbin/lsof", [
    "-nP",
    "-iTCP",
    "-sTCP:LISTEN",
  ]);
  const listeners = lsof ? parseListeners(lsof) : [];
  return { listeners };
}

function parseListeners(output: string): Array<{
  command: string;
  pid: number | null;
  user: string | null;
  address: string;
}> {
  const [, ...lines] = output.trim().split("\n");
  return lines.flatMap((line) => {
    const parts = line.trim().split(/\s+/);
    const nameIndex = parts.findIndex((part) =>
      part.includes(":") || part.includes("->")
    );
    if (parts.length < 9 || nameIndex === -1) return [];
    return [{
      command: parts[0],
      pid: parseNumber(parts[1]),
      user: parts[2] ?? null,
      address: parts.slice(nameIndex).join(" "),
    }];
  });
}

async function collectHardware(state: RunState): Promise<{
  model: string | null;
  cpu: string | null;
  memoryBytes: number | null;
}> {
  const output = await commandText(state, "/usr/sbin/system_profiler", [
    "SPHardwareDataType",
    "-detailLevel",
    "mini",
    "-json",
  ]);
  if (!output) {
    return { model: null, cpu: null, memoryBytes: null };
  }

  try {
    const parsed = JSON.parse(output) as {
      SPHardwareDataType?: Array<{
        machine_model?: string;
        machine_name?: string;
        chip_type?: string;
        physical_memory?: string;
      }>;
    };
    const hardware = parsed.SPHardwareDataType?.[0];
    return {
      model: [hardware?.machine_name, hardware?.machine_model].filter(Boolean)
        .join(" ") || null,
      cpu: hardware?.chip_type ?? null,
      memoryBytes: parseMemoryBytes(hardware?.physical_memory),
    };
  } catch {
    return { model: null, cpu: null, memoryBytes: null };
  }
}

function parseMemoryBytes(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.match(/^([\d.]+)\s*(KB|MB|GB|TB)$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  const unit = match[2].toUpperCase();
  const multiplier = unit === "KB"
    ? 1024
    : unit === "MB"
    ? 1024 ** 2
    : unit === "GB"
    ? 1024 ** 3
    : 1024 ** 4;
  return Math.round(amount * multiplier);
}

async function collectLaunchd(
  includeLaunchd: boolean,
  findings: Finding[],
): Promise<z.infer<typeof SnapshotSchema>["launchd"]> {
  const home = Deno.env.get("HOME");
  const directories = [
    "/Library/LaunchDaemons",
    "/Library/LaunchAgents",
    ...(home ? [`${home}/Library/LaunchAgents`] : []),
  ];

  if (!includeLaunchd) {
    return {
      scannedDirectories: [],
      plistCount: 0,
      writablePlists: [],
      unreadableDirectories: [],
    };
  }

  const writablePlists: Array<{ path: string; mode: string }> = [];
  const unreadableDirectories: string[] = [];
  let plistCount = 0;

  for (const directory of directories) {
    try {
      for await (const entry of Deno.readDir(directory)) {
        if (!entry.isFile || !entry.name.endsWith(".plist")) continue;
        plistCount += 1;
        const path = `${directory}/${entry.name}`;
        try {
          const stat = await Deno.stat(path);
          const mode = stat.mode ?? 0;
          if ((mode & 0o022) !== 0) {
            writablePlists.push({
              path,
              mode: `0${(mode & 0o777).toString(8)}`,
            });
          }
        } catch {
          unreadableDirectories.push(path);
        }
      }
    } catch {
      unreadableDirectories.push(directory);
    }
  }

  if (writablePlists.length > 0) {
    findings.push(finding(
      "launchd-writable-plists",
      "critical",
      "launchd",
      "Writable launchd plists found",
      `${writablePlists.length} LaunchAgent/LaunchDaemon plist files are group- or world-writable.`,
      "Fix plist ownership and modes; launchd plists should not be writable by untrusted users.",
    ));
  }

  return {
    scannedDirectories: directories,
    plistCount,
    writablePlists,
    unreadableDirectories,
  };
}

async function collectHomebrew(
  state: RunState,
  includeHomebrew: boolean,
  findings: Finding[],
): Promise<z.infer<typeof SnapshotSchema>["homebrew"]> {
  if (!includeHomebrew) {
    return {
      present: false,
      version: null,
      outdatedFormulae: null,
      outdatedCasks: null,
      error: null,
    };
  }

  const brewPath = await commandText(state, "/usr/bin/which", ["brew"]);
  if (!brewPath) {
    return {
      present: false,
      version: null,
      outdatedFormulae: null,
      outdatedCasks: null,
      error: null,
    };
  }

  const version = await commandText(state, brewPath, ["--version"]);
  const outdated = await commandText(
    state,
    brewPath,
    ["outdated", "--json=v2"],
    Math.max(state.timeoutMs, 20000),
  );
  if (!outdated) {
    return {
      present: true,
      version,
      outdatedFormulae: null,
      outdatedCasks: null,
      error: "Could not run brew outdated.",
    };
  }

  try {
    const parsed = JSON.parse(outdated) as {
      formulae?: unknown[];
      casks?: unknown[];
    };
    const outdatedFormulae = parsed.formulae?.length ?? 0;
    const outdatedCasks = parsed.casks?.length ?? 0;
    if (outdatedFormulae + outdatedCasks > 0) {
      findings.push(finding(
        "homebrew-outdated",
        "info",
        "updates",
        "Homebrew packages are outdated",
        `${outdatedFormulae} formulae and ${outdatedCasks} casks are outdated.`,
        "Review outdated packages and upgrade according to local change policy.",
      ));
    }
    return {
      present: true,
      version,
      outdatedFormulae,
      outdatedCasks,
      error: null,
    };
  } catch (error) {
    return {
      present: true,
      version,
      outdatedFormulae: null,
      outdatedCasks: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const STANDARD_PATH_DIRS = new Set([
  "/bin",
  "/sbin",
  "/usr/bin",
  "/usr/sbin",
  "/usr/local/bin",
  "/opt/homebrew/bin",
]);

function isStandardPathDirectory(path: string): boolean {
  return STANDARD_PATH_DIRS.has(path) ||
    path.startsWith("/System/Cryptexes/App/") ||
    path.startsWith("/var/run/com.apple.security.cryptexd/");
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

async function statMode(path: string): Promise<number | null> {
  try {
    const stat = await Deno.stat(path);
    return stat.mode ?? null;
  } catch {
    return null;
  }
}

async function executableNames(directory: string): Promise<Set<string>> {
  const names = new Set<string>();
  try {
    for await (const entry of Deno.readDir(directory)) {
      if (!entry.isFile && !entry.isSymlink) continue;
      const path = `${directory}/${entry.name}`;
      try {
        const stat = await Deno.stat(path);
        if (((stat.mode ?? 0) & 0o111) !== 0) {
          names.add(entry.name);
        }
      } catch {
        // Ignore broken symlinks and unreadable files.
      }
    }
  } catch {
    return names;
  }
  return names;
}

async function collectPathHygiene(
  findings: Finding[],
): Promise<z.infer<typeof SnapshotSchema>["path"]> {
  const raw = Deno.env.get("PATH") ?? null;
  const entries = (raw ?? "").split(":").filter((entry) => entry.length > 0);
  const counts = new Map<string, number>();
  for (const entry of entries) {
    counts.set(entry, (counts.get(entry) ?? 0) + 1);
  }

  const standardCommands = new Set<string>();
  for (const directory of STANDARD_PATH_DIRS) {
    for (const name of await executableNames(directory)) {
      standardCommands.add(name);
    }
  }

  const directories = [];
  for (const [index, path] of entries.entries()) {
    const exists = await pathExists(path);
    const modeValue = exists ? await statMode(path) : null;
    const executable = exists ? await executableNames(path) : new Set<string>();
    const standard = isStandardPathDirectory(path);
    const relative = !path.startsWith("/");
    const groupOrWorldWritable = modeValue !== null &&
      (modeValue & 0o022) !== 0;
    const shadowedSystemCommands = standard ? [] : [...executable]
      .filter((name) => standardCommands.has(name))
      .slice(0, 20)
      .toSorted();

    directories.push({
      index,
      path,
      exists,
      standard,
      relative,
      mode: modeValue === null ? null : `0${(modeValue & 0o777).toString(8)}`,
      groupOrWorldWritable,
      commandCount: executable.size,
      shadowedSystemCommands,
    });
  }

  const duplicateDirectories = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([path]) => path)
    .toSorted();
  const writable = directories.filter((directory) =>
    directory.groupOrWorldWritable
  );
  const relative = directories.filter((directory) => directory.relative);
  const missing = directories.filter((directory) => !directory.exists);
  const shadowing = directories.filter((directory) =>
    directory.shadowedSystemCommands.length > 0
  );

  if (writable.length > 0) {
    findings.push(finding(
      "path-group-world-writable",
      "warn",
      "path",
      "Writable PATH directories found",
      `${writable.length} PATH directories are group- or world-writable.`,
      "Remove writable directories from PATH or fix ownership and mode.",
    ));
  }
  if (relative.length > 0) {
    findings.push(finding(
      "path-relative-entry",
      "critical",
      "path",
      "Relative PATH entries found",
      `${relative.length} PATH entries are relative paths.`,
      "Use absolute PATH entries only.",
    ));
  }
  if (shadowing.length > 0) {
    findings.push(finding(
      "path-system-command-shadowing",
      "warn",
      "path",
      "Non-standard PATH directories shadow system commands",
      shadowing.map((directory) =>
        `${directory.path}: ${
          directory.shadowedSystemCommands.slice(0, 5).join(", ")
        }`
      ).join("; "),
      "Review earlier non-standard PATH directories for command shadowing.",
    ));
  }
  if (missing.length > 0 || duplicateDirectories.length > 0) {
    findings.push(finding(
      "path-hygiene",
      "info",
      "path",
      "PATH contains stale or duplicate entries",
      `${missing.length} missing directories, ${duplicateDirectories.length} duplicates.`,
      "Clean PATH to reduce ambiguity when resolving commands.",
    ));
  }

  return { raw, directories, duplicateDirectories };
}

function configCheck(
  value: string | null,
  expected: string,
  label: string,
): Check {
  if (value === null) {
    return check("unknown", null, `Could not read ${label}.`);
  }
  const normalized = value.toLowerCase();
  return check(
    normalized === expected ? "pass" : "warn",
    normalized === expected,
    `${label}=${value}`,
  );
}

async function collectSafeguards(
  state: RunState,
  findings: Finding[],
): Promise<z.infer<typeof SnapshotSchema>["safeguards"]> {
  const npmPath = await commandText(state, "/usr/bin/which", ["npm"]);
  const socketPath = await commandText(state, "/usr/bin/which", ["socket"]);
  const denoPath = await commandText(state, "/usr/bin/which", ["deno"]);
  const pipxPath = await commandText(state, "/usr/bin/which", ["pipx"]);

  const audit = npmPath
    ? configCheck(
      await commandText(state, npmPath, ["config", "get", "audit"]),
      "true",
      "npm audit",
    )
    : check("unknown", null, "npm not found.");
  const ignoreScripts = npmPath
    ? configCheck(
      await commandText(state, npmPath, ["config", "get", "ignore-scripts"]),
      "true",
      "npm ignore-scripts",
    )
    : check("unknown", null, "npm not found.");
  const packageLock = npmPath
    ? configCheck(
      await commandText(state, npmPath, ["config", "get", "package-lock"]),
      "true",
      "npm package-lock",
    )
    : check("unknown", null, "npm not found.");

  if (audit.status === "warn") {
    findings.push(finding(
      "npm-audit-disabled",
      "warn",
      "safeguards",
      "npm audit is disabled",
      audit.detail ?? "npm audit is not enabled.",
      "Keep npm audit enabled unless another scanner owns dependency vulnerability checks.",
    ));
  }
  if (ignoreScripts.status === "warn") {
    findings.push(finding(
      "npm-install-scripts-enabled",
      "info",
      "safeguards",
      "npm lifecycle scripts are allowed during install",
      ignoreScripts.detail ?? "npm ignore-scripts is false.",
      "For high-risk repos, consider npm install --ignore-scripts or an approved wrapper.",
    ));
  }

  const denoVersion = denoPath
    ? await commandText(state, denoPath, ["--version"])
    : null;

  return {
    npm: {
      present: npmPath !== null,
      path: npmPath,
      audit,
      ignoreScripts,
      packageLock,
    },
    socket: {
      present: socketPath !== null,
      path: socketPath,
    },
    deno: {
      present: denoPath !== null,
      path: denoPath,
      version: denoVersion?.split("\n")[0] ?? null,
    },
    pipx: {
      present: pipxPath !== null,
      path: pipxPath,
    },
  };
}

async function detectInstalled(paths: string[]): Promise<string | null> {
  for (const path of paths) {
    if (await pathExists(path)) {
      return path;
    }
  }
  return null;
}

async function collectRecommendations(): Promise<
  z.infer<typeof SnapshotSchema>["recommendations"]
> {
  const tools = [
    {
      name: "LuLu",
      category: "outbound firewall",
      paths: ["/Applications/LuLu.app"],
      installHint: "Download from Objective-See.",
      url: "https://objective-see.org/products/lulu.html",
      rationale:
        "Free, open-source outbound firewall for observing and controlling unexpected network egress.",
    },
    {
      name: "KnockKnock",
      category: "persistence inspection",
      paths: ["/Applications/KnockKnock.app"],
      installHint: "Download from Objective-See.",
      url: "https://objective-see.org/products/knockknock.html",
      rationale: "Enumerates persistent software locations for manual review.",
    },
    {
      name: "BlockBlock",
      category: "persistence monitor",
      paths: ["/Applications/BlockBlock.app"],
      installHint: "Download from Objective-See.",
      url: "https://objective-see.org/products/blockblock.html",
      rationale:
        "Monitors common persistence locations and prompts on changes.",
    },
    {
      name: "osquery",
      category: "endpoint visibility",
      paths: [
        "/opt/homebrew/bin/osqueryi",
        "/usr/local/bin/osqueryi",
        "/usr/bin/osqueryi",
      ],
      installHint: "Install with Homebrew or the upstream package.",
      url: "https://osquery.io/",
      rationale:
        "Open-source SQL interface for endpoint inventory and security questions.",
    },
    {
      name: "Santa",
      category: "binary authorization",
      paths: ["/usr/local/bin/santactl", "/opt/homebrew/bin/santactl"],
      installHint:
        "Install from the Santa project when binary authorization fits the host policy.",
      url: "https://santa.dev/",
      rationale:
        "Open-source macOS binary authorization and monitoring system.",
    },
  ];

  const recommendations = [];
  for (const tool of tools) {
    const detectedPath = await detectInstalled(tool.paths);
    recommendations.push({
      name: tool.name,
      category: tool.category,
      installed: detectedPath !== null,
      detectedPath,
      installHint: tool.installHint,
      url: tool.url,
      rationale: tool.rationale,
    });
  }
  return recommendations;
}

async function collectManagement(
  state: RunState,
): Promise<z.infer<typeof SnapshotSchema>["management"]> {
  const enrollment = await runCommand(state, "/usr/bin/profiles", [
    "status",
    "-type",
    "enrollment",
  ]);
  const enrollmentText = commandOutput(enrollment);
  const managed = enrollmentText.includes("MDM enrollment: Yes") ||
    enrollmentText.includes("Enrolled via DEP: Yes");
  const profiles = await runCommand(state, "/usr/bin/profiles", ["list"]);

  return {
    enrollment: enrollment.ok
      ? check(managed ? "pass" : "unknown", managed, enrollmentText)
      : check(
        "unknown",
        null,
        enrollmentText || "Could not read enrollment status.",
      ),
    profiles: {
      readable: profiles.ok,
      count: profiles.ok
        ? commandOutput(profiles).split("\n").filter((line) =>
          line.includes("attribute: profileIdentifier")
        ).length
        : 0,
      error: profiles.ok ? null : commandOutput(profiles),
    },
  };
}

function classifySystemExtension(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("endpoint")) return "endpoint-security";
  if (lower.includes("network")) return "network";
  if (lower.includes("driver")) return "driver";
  return "system-extension";
}

async function collectSystemExtensions(
  state: RunState,
): Promise<z.infer<typeof SnapshotSchema>["systemExtensions"]> {
  const result = await runCommand(state, "/usr/bin/systemextensionsctl", [
    "list",
  ]);
  const output = commandOutput(result);
  const entries = result.ok
    ? output.split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("*") || line.includes("\t"))
      .map((raw) => {
        const parts = raw.replace(/^\*\s*/, "").split(/\s+/);
        return {
          raw,
          teamId: parts.find((part) => /^[A-Z0-9]{10}$/.test(part)) ?? null,
          bundleId: parts.find((part) => part.includes(".")) ?? null,
          state: raw.match(/\[(.*?)\]/)?.[1] ?? null,
          category: classifySystemExtension(raw),
        };
      })
    : [];
  return {
    readable: result.ok,
    count: entries.length,
    entries,
    error: result.ok ? null : output,
  };
}

async function collectPersistence(
  state: RunState,
  privileged: PrivilegedDecision,
): Promise<z.infer<typeof SnapshotSchema>["persistence"]> {
  if (!privileged.approved) {
    return {
      backgroundItems: {
        readable: false,
        count: 0,
        error:
          "Skipped background item probe because it can trigger macOS authorization. Re-run with privilegedMode=prompt to allow it.",
      },
    };
  }
  const result = await runCommand(state, "/usr/bin/sfltool", ["dumpbtm"]);
  const output = commandOutput(result);
  return {
    backgroundItems: {
      readable: result.ok,
      count: result.ok
        ? output.split("\n").filter((line) => line.includes("Bundle ID:"))
          .length
        : 0,
      error: result.ok ? null : output,
    },
  };
}

async function collectTcc(
  state: RunState,
): Promise<z.infer<typeof SnapshotSchema>["tcc"]> {
  const home = Deno.env.get("HOME");
  const candidates = [
    ...(home
      ? [`${home}/Library/Application Support/com.apple.TCC/TCC.db`]
      : []),
    "/Library/Application Support/com.apple.TCC/TCC.db",
  ];
  const database = (await Promise.all(
    candidates.map(async (path) => (await pathExists(path)) ? path : null),
  )).find((path) => path !== null) ?? null;
  if (!database) {
    return {
      readable: false,
      database: null,
      grantsByService: {},
      error: "TCC database not found.",
    };
  }

  const sqlite = await commandText(state, "/usr/bin/which", ["sqlite3"]);
  if (!sqlite) {
    return {
      readable: false,
      database,
      grantsByService: {},
      error: "sqlite3 not found.",
    };
  }
  const query =
    "select service, count(*) from access where auth_value=2 group by service;";
  const result = await runCommand(state, sqlite, [database, query]);
  if (!result.ok) {
    return {
      readable: false,
      database,
      grantsByService: {},
      error: commandOutput(result),
    };
  }
  const grantsByService: Record<string, number> = {};
  for (const line of result.stdout.split("\n")) {
    const [service, count] = line.split("|");
    const parsed = Number(count);
    if (service && Number.isFinite(parsed)) {
      grantsByService[service] = parsed;
    }
  }
  return { readable: true, database, grantsByService, error: null };
}

function modeString(mode: number | null): string | null {
  return mode === null ? null : `0${(mode & 0o777).toString(8)}`;
}

async function collectSsh(
  state: RunState,
  findings: Finding[],
): Promise<z.infer<typeof SnapshotSchema>["ssh"]> {
  const home = Deno.env.get("HOME");
  const directoryPath = home ? `${home}/.ssh` : null;
  const directoryMode = directoryPath && await pathExists(directoryPath)
    ? await statMode(directoryPath)
    : null;
  const configPath = directoryPath ? `${directoryPath}/config` : null;
  const configMode = configPath && await pathExists(configPath)
    ? await statMode(configPath)
    : null;
  const privateKeys: Array<{ path: string; mode: string | null; ok: boolean }> =
    [];

  if (directoryPath && await pathExists(directoryPath)) {
    try {
      for await (const entry of Deno.readDir(directoryPath)) {
        if (!entry.isFile) continue;
        const path = `${directoryPath}/${entry.name}`;
        if (
          entry.name.endsWith(".pub") || entry.name === "known_hosts" ||
          entry.name === "config"
        ) {
          continue;
        }
        const text = await Deno.readTextFile(path).catch(() => "");
        if (!text.includes("PRIVATE KEY")) continue;
        const mode = await statMode(path);
        const ok = mode !== null && (mode & 0o077) === 0;
        privateKeys.push({ path, mode: modeString(mode), ok });
      }
    } catch {
      // Ignore unreadable SSH directories; mode checks above still report state.
    }
  }

  const badKeys = privateKeys.filter((key) => !key.ok);
  if (badKeys.length > 0) {
    findings.push(finding(
      "ssh-private-key-permissions",
      "critical",
      "ssh",
      "SSH private keys have weak permissions",
      `${badKeys.length} private keys are readable by group or other.`,
      "Set private key modes to 0600 or stricter.",
    ));
  }

  const agent = await commandText(state, "/usr/bin/ssh-add", ["-l"]);
  return {
    directory: {
      path: directoryPath,
      exists: directoryPath ? await pathExists(directoryPath) : false,
      mode: modeString(directoryMode),
      ok: directoryMode === null || (directoryMode & 0o077) === 0,
    },
    config: {
      exists: configMode !== null,
      mode: modeString(configMode),
      ok: configMode === null || (configMode & 0o077) === 0,
    },
    privateKeys,
    agentKeys: agent
      ? agent.split("\n").filter((line) => line.trim()).length
      : null,
  };
}

async function collectHomebrewSecurity(
  state: RunState,
  findings: Finding[],
): Promise<z.infer<typeof SnapshotSchema>["homebrewSecurity"]> {
  const brewPath = await commandText(state, "/usr/bin/which", ["brew"]);
  if (!brewPath) {
    return { taps: [], nonOfficialTaps: [], services: [] };
  }
  const tapOutput = await commandText(state, brewPath, ["tap"]);
  const tapNames =
    tapOutput?.split("\n").map((line) => line.trim()).filter(Boolean) ?? [];
  const taps = tapNames.map((name) => ({
    name,
    official: name.startsWith("homebrew/"),
  }));
  const nonOfficialTaps = taps.filter((tap) => !tap.official).map((tap) =>
    tap.name
  );
  if (nonOfficialTaps.length > 0) {
    findings.push(finding(
      "homebrew-non-official-taps",
      "info",
      "homebrew",
      "Homebrew has non-official taps",
      nonOfficialTaps.join(", "),
      "Review custom taps as part of local supply-chain policy.",
    ));
  }

  const servicesOutput = await commandText(state, brewPath, [
    "services",
    "list",
    "--json",
  ]);
  const services = servicesOutput
    ? (JSON.parse(servicesOutput) as Array<
      { name?: string; status?: string; file?: string }
    >)
      .map((service) => ({
        name: service.name ?? "unknown",
        status: service.status ?? "unknown",
        file: service.file ?? null,
      }))
    : [];
  const running = services.filter((service) => service.status === "started");
  if (running.length > 0) {
    findings.push(finding(
      "homebrew-services-running",
      "info",
      "homebrew",
      "Homebrew services are running",
      running.map((service) => service.name).join(", "),
      "Review background services installed through Homebrew.",
    ));
  }

  return { taps, nonOfficialTaps, services };
}

function registryCheck(
  value: string | null,
  expected: string,
  label: string,
): Check {
  if (value === null) return check("unknown", null, `Could not read ${label}.`);
  return check(
    value.trim() === expected ? "pass" : "warn",
    value.trim(),
    `${label}=${value.trim()}`,
  );
}

async function collectEcosystems(
  state: RunState,
  findings: Finding[],
): Promise<z.infer<typeof SnapshotSchema>["ecosystems"]> {
  const npm = await commandText(state, "/usr/bin/which", ["npm"]);
  const npmRegistry = npm
    ? registryCheck(
      await commandText(state, npm, ["config", "get", "registry"]),
      "https://registry.npmjs.org/",
      "npm registry",
    )
    : check("unknown", null, "npm not found.");

  const pip = await commandText(state, "/usr/bin/which", ["pip3"]) ??
    await commandText(state, "/usr/bin/which", ["pip"]);
  const pipValue = pip
    ? await commandText(state, pip, ["config", "get", "global.index-url"])
    : null;
  const pipIndexUrl = pipValue
    ? registryCheck(pipValue, "https://pypi.org/simple", "pip index-url")
    : check(
      "unknown",
      null,
      pip ? "pip index-url is not configured." : "pip not found.",
    );

  const home = Deno.env.get("HOME");
  const cargoPaths = home
    ? [`${home}/.cargo/config.toml`, `${home}/.cargo/config`]
    : [];
  const cargoConfigPath = (await Promise.all(
    cargoPaths.map(async (path) => (await pathExists(path)) ? path : null),
  )).find((path) => path !== null) ?? null;
  const cargoConfig = cargoConfigPath
    ? check(
      "unknown",
      cargoConfigPath,
      `Cargo config exists at ${cargoConfigPath}.`,
    )
    : check("pass", false, "No user Cargo config found.");

  const gem = await commandText(state, "/usr/bin/which", ["gem"]);
  const gemSourcesOutput = gem
    ? await commandText(state, gem, ["sources", "--list"])
    : null;
  const gemSources = gemSourcesOutput
    ? check(
      gemSourcesOutput.includes("https://rubygems.org/") ? "pass" : "warn",
      gemSourcesOutput.includes("https://rubygems.org/"),
      gemSourcesOutput,
    )
    : check(
      "unknown",
      null,
      gem ? "Could not read gem sources." : "gem not found.",
    );

  const go = await commandText(state, "/usr/bin/which", ["go"]);
  const goEnv = go
    ? await commandText(state, go, ["env", "GOSUMDB", "GONOSUMDB", "GOPRIVATE"])
    : null;
  const goChecksum = goEnv
    ? check(
      goEnv.split("\n")[0]?.includes("sum.golang.org") ? "pass" : "warn",
      goEnv,
      goEnv.replaceAll("\n", "; "),
    )
    : check("unknown", null, go ? "Could not read go env." : "go not found.");

  for (
    const [id, result] of [
      ["npm-registry", npmRegistry],
      ["pip-index-url", pipIndexUrl],
      ["gem-sources", gemSources],
      ["go-checksum-db", goChecksum],
    ] as const
  ) {
    if (result.status === "warn") {
      findings.push(finding(
        `ecosystem-${id}`,
        "info",
        "ecosystems",
        "Non-default language ecosystem configuration",
        result.detail ?? id,
        "Review non-default registries/checksum settings for supply-chain policy.",
      ));
    }
  }

  return { npmRegistry, pipIndexUrl, cargoConfig, gemSources, goChecksum };
}

async function readJsonFile(
  path: string,
): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await Deno.readTextFile(path)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function collectBrowsers(): Promise<
  z.infer<typeof SnapshotSchema>["browsers"]
> {
  const home = Deno.env.get("HOME");
  if (!home) return { profiles: [] };
  const roots = [
    ["Chrome", `${home}/Library/Application Support/Google/Chrome`],
    ["Edge", `${home}/Library/Application Support/Microsoft Edge`],
    [
      "Brave",
      `${home}/Library/Application Support/BraveSoftware/Brave-Browser`,
    ],
  ] as const;
  const profiles = [];
  for (const [browser, root] of roots) {
    if (!await pathExists(root)) continue;
    for await (const entry of Deno.readDir(root)) {
      if (!entry.isDirectory || !/^(Default|Profile )/.test(entry.name)) {
        continue;
      }
      const extensionsDir = `${root}/${entry.name}/Extensions`;
      if (!await pathExists(extensionsDir)) continue;
      const extensions = [];
      for await (const ext of Deno.readDir(extensionsDir)) {
        if (!ext.isDirectory) continue;
        const versionDirs = [];
        for await (
          const version of Deno.readDir(`${extensionsDir}/${ext.name}`)
        ) {
          if (version.isDirectory) versionDirs.push(version.name);
        }
        const latest = versionDirs.toSorted((a, b) =>
          a.localeCompare(b, undefined, { numeric: true })
        ).at(-1);
        const manifest = latest
          ? await readJsonFile(
            `${extensionsDir}/${ext.name}/${latest}/manifest.json`,
          )
          : null;
        extensions.push({
          id: ext.name,
          name: typeof manifest?.name === "string" ? manifest.name : null,
          version: typeof manifest?.version === "string"
            ? manifest.version
            : null,
          source: "profile",
        });
      }
      profiles.push({
        browser,
        profile: entry.name,
        extensionCount: extensions.length,
        unpackedCount: 0,
        extensions: extensions.slice(0, 100),
      });
    }
  }
  return { profiles };
}

async function collectApplications(
  state: RunState,
  includeApplications: boolean,
): Promise<z.infer<typeof SnapshotSchema>["applications"]> {
  if (!includeApplications) {
    return {
      enabled: false,
      scanned: 0,
      unsigned: [],
      rejected: [],
      quarantined: [],
      errors: [],
    };
  }

  const home = Deno.env.get("HOME");
  const roots = ["/Applications", ...(home ? [`${home}/Applications`] : [])];
  const apps = [];
  for (const root of roots) {
    if (!await pathExists(root)) continue;
    for await (const entry of Deno.readDir(root)) {
      if (entry.isDirectory && entry.name.endsWith(".app")) {
        apps.push(`${root}/${entry.name}`);
      }
    }
  }
  const unsigned: string[] = [];
  const rejected: string[] = [];
  const quarantined: string[] = [];
  const errors: string[] = [];
  for (const app of apps.slice(0, 60)) {
    const codesign = await runCommand(state, "/usr/bin/codesign", [
      "--verify",
      "--deep",
      "--strict",
      app,
    ], Math.min(state.timeoutMs, 5000));
    if (!codesign.ok) unsigned.push(app);
    const spctl = await runCommand(state, "/usr/sbin/spctl", [
      "-a",
      "-vv",
      app,
    ], Math.min(state.timeoutMs, 5000));
    if (!spctl.ok) rejected.push(app);
    const xattr = await runCommand(state, "/usr/bin/xattr", [
      "-p",
      "com.apple.quarantine",
      app,
    ], Math.min(state.timeoutMs, 2000));
    if (xattr.ok) quarantined.push(app);
    if (codesign.timedOut || spctl.timedOut) errors.push(app);
  }
  return {
    enabled: true,
    scanned: apps.slice(0, 60).length,
    unsigned,
    rejected,
    quarantined,
    errors,
  };
}

async function collectSecrets(
  findings: Finding[],
): Promise<z.infer<typeof SnapshotSchema>["secrets"]> {
  const home = Deno.env.get("HOME");
  const paths = home
    ? [
      [`${home}/.npmrc`, "npm"],
      [`${home}/.pypirc`, "python"],
      [`${home}/.netrc`, "netrc"],
      [`${home}/.aws/credentials`, "aws"],
      [`${home}/.config/gh/hosts.yml`, "github"],
      [`${home}/.docker/config.json`, "docker"],
      [`${home}/.kube/config`, "kubernetes"],
    ] as const
    : [];
  const checked = [];
  for (const [path, kind] of paths) {
    const exists = await pathExists(path);
    const mode = exists ? await statMode(path) : null;
    const ok = !exists || (mode !== null && (mode & 0o077) === 0);
    checked.push({ path, exists, mode: modeString(mode), ok, kind });
  }
  const weak = checked.filter((item) => item.exists && !item.ok);
  if (weak.length > 0) {
    findings.push(finding(
      "secret-file-permissions",
      "critical",
      "secrets",
      "Credential files have weak permissions",
      `${weak.length} credential files are readable by group or other.`,
      "Set credential file modes to 0600 or stricter.",
    ));
  }
  return { checked };
}

function summarize(
  findings: Finding[],
): { critical: number; warn: number; info: number } {
  return {
    critical: findings.filter((item) => item.severity === "critical").length,
    warn: findings.filter((item) => item.severity === "warn").length,
    info: findings.filter((item) => item.severity === "info").length,
  };
}

/**
 * Read-only macOS posture model for local security, sanity, and performance checks.
 *
 * The model records a structured snapshot and emits severity-rated findings
 * without changing host configuration or installing/removing software.
 */
export const model = {
  type: "@alvagante/macos-doctor",
  version: "2026.05.22.1",
  reports: ["@alvagante/macos-doctor-report"],
  globalArguments: z.object({}),
  resources: {
    snapshot: {
      description: "Read-only local macOS posture snapshot",
      schema: SnapshotSchema,
      lifetime: "30d",
      garbageCollection: 20,
    },
  },
  methods: {
    check: {
      description:
        "Collect a read-only local macOS security, sanity, and performance snapshot",
      arguments: CheckArgsSchema,
      execute: async (args: CheckArgs, context: ModelContext) => {
        if (Deno.build.os !== "darwin") {
          throw new Error("@alvagante/macos-doctor requires macOS.");
        }

        context.logger?.info("Collecting macOS Doctor snapshot", {
          includeHomebrew: args.includeHomebrew,
          includeListeners: args.includeListeners,
          includeLaunchd: args.includeLaunchd,
          includeApplications: args.includeApplications,
          includeSoftwareUpdateList: args.includeSoftwareUpdateList,
          includeCommandOutput: args.includeCommandOutput,
          privilegedMode: args.privilegedMode,
          detailMode: args.detailMode,
        });

        const state: RunState = {
          timeoutMs: args.commandTimeoutMs,
          includeCommandOutput: args.includeCommandOutput,
          commands: [],
        };
        const findings: Finding[] = [];
        const privileged = resolvePrivilegedDecision(args.privilegedMode);

        const [
          productName,
          productVersion,
          buildVersion,
          kernelRelease,
          hostname,
          hardware,
        ] = await Promise.all([
          commandText(state, "/usr/bin/sw_vers", ["-productName"]),
          commandText(state, "/usr/bin/sw_vers", ["-productVersion"]),
          commandText(state, "/usr/bin/sw_vers", ["-buildVersion"]),
          commandText(state, "/usr/bin/uname", ["-r"]),
          commandText(state, "/bin/hostname"),
          collectHardware(state),
        ]);

        const security = await collectSecurity(state, findings, privileged);
        const updates = await collectUpdates(
          state,
          findings,
          args.includeSoftwareUpdateList,
        );
        const performance = await collectPerformance(state, findings);
        const network = await collectNetwork(state, args.includeListeners);
        const launchd = await collectLaunchd(args.includeLaunchd, findings);
        const homebrew = await collectHomebrew(
          state,
          args.includeHomebrew,
          findings,
        );
        const path = await collectPathHygiene(findings);
        const safeguards = await collectSafeguards(state, findings);
        const recommendations = await collectRecommendations();
        const management = await collectManagement(state);
        const systemExtensions = await collectSystemExtensions(state);
        const persistence = await collectPersistence(state, privileged);
        const tcc = await collectTcc(state);
        const ssh = await collectSsh(state, findings);
        const homebrewSecurity = await collectHomebrewSecurity(
          state,
          findings,
        );
        const ecosystems = await collectEcosystems(state, findings);
        const browsers = await collectBrowsers();
        const applications = await collectApplications(
          state,
          args.includeApplications,
        );
        const secrets = await collectSecrets(findings);

        const snapshot = {
          collectedAt: new Date().toISOString(),
          platform: {
            os: Deno.build.os,
            arch: Deno.build.arch,
          },
          host: { hostname },
          os: {
            productName,
            productVersion,
            buildVersion,
            kernelRelease,
          },
          hardware: {
            model: hardware.model,
            cpu: hardware.cpu,
            memoryBytes: hardware.memoryBytes,
          },
          security,
          updates,
          performance,
          network,
          launchd,
          homebrew,
          path,
          safeguards,
          recommendations,
          management,
          systemExtensions,
          persistence,
          tcc,
          ssh,
          homebrewSecurity,
          ecosystems,
          browsers,
          applications,
          secrets,
          findings,
          summary: summarize(findings),
          commands: state.commands,
          privileged,
        };

        const handle = await context.writeResource(
          "snapshot",
          "current",
          snapshot,
          {
            tags: {
              kind: "macos-doctor",
              platform: "macos",
            },
          },
        );

        context.logger?.info("Collected macOS Doctor snapshot", {
          critical: snapshot.summary.critical,
          warn: snapshot.summary.warn,
          info: snapshot.summary.info,
          commands: state.commands.length,
        });

        return { dataHandles: [handle] };
      },
    },
  },
};

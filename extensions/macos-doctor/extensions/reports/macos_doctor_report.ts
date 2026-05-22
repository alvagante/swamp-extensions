type DataHandle = {
  name: string;
  specName: string;
  version?: number;
};

type WorkflowStepExecution = {
  modelType: string;
  modelId: string;
  dataHandles: DataHandle[];
};

type ReportContext = {
  scope: "method" | "model" | "workflow";
  modelType?: string;
  modelId?: string;
  methodName?: string;
  methodArgs?: Record<string, unknown>;
  executionStatus?: "succeeded" | "failed";
  errorMessage?: string;
  dataHandles?: DataHandle[];
  workflowName?: string;
  workflowStatus?: "succeeded" | "failed";
  stepExecutions?: WorkflowStepExecution[];
  dataRepository: {
    getContent: (
      type: string,
      modelId: string,
      dataName: string,
      version?: number,
    ) => Promise<Uint8Array | null>;
  };
};

type Finding = {
  id: string;
  severity: "info" | "warn" | "critical";
  category: string;
  title: string;
  detail: string;
  recommendation?: string;
};

type Check = {
  status: "pass" | "warn" | "fail" | "unknown";
  value: string | number | boolean | null;
  detail?: string;
};

type DetailMode = "summary" | "findings" | "all";

type Snapshot = {
  collectedAt: string;
  host: { hostname: string | null };
  os: {
    productName: string | null;
    productVersion: string | null;
    buildVersion: string | null;
  };
  security: Record<string, Check>;
  updates: Record<string, Check>;
  summary: { critical: number; warn: number; info: number };
  findings: Finding[];
  performance: {
    rootDiskUsedPercent: number | null;
    memoryFreePercent: number | null;
    loadAverage1m: number | null;
  };
  launchd: {
    plistCount: number;
    writablePlists: Array<{ path: string; mode: string }>;
  };
  network: {
    listeners: Array<
      {
        command: string;
        pid: number | null;
        user: string | null;
        address: string;
      }
    >;
  };
  homebrew: {
    present: boolean;
    outdatedFormulae: number | null;
    outdatedCasks: number | null;
  };
  path?: {
    raw: string | null;
    directories: Array<{
      index: number;
      path: string;
      exists: boolean;
      standard: boolean;
      relative: boolean;
      mode: string | null;
      groupOrWorldWritable: boolean;
      commandCount: number;
      shadowedSystemCommands: string[];
    }>;
    duplicateDirectories: string[];
  };
  safeguards?: {
    npm: {
      present: boolean;
      path: string | null;
      audit: Check;
      ignoreScripts: Check;
      packageLock: Check;
    };
    socket: { present: boolean; path: string | null };
    deno: { present: boolean; path: string | null; version: string | null };
    pipx: { present: boolean; path: string | null };
  };
  recommendations?: Array<{
    name: string;
    category: string;
    installed: boolean;
    detectedPath: string | null;
    installHint: string;
    url: string;
    rationale: string;
  }>;
  management?: {
    enrollment: Check;
    profiles: { readable: boolean; count: number; error: string | null };
  };
  systemExtensions?: {
    readable: boolean;
    count: number;
    entries: Array<{
      raw: string;
      teamId: string | null;
      bundleId: string | null;
      state: string | null;
      category: string;
    }>;
    error: string | null;
  };
  persistence?: {
    backgroundItems: { readable: boolean; count: number; error: string | null };
  };
  tcc?: {
    readable: boolean;
    database: string | null;
    grantsByService: Record<string, number>;
    error: string | null;
  };
  ssh?: {
    directory: {
      path: string | null;
      exists: boolean;
      mode: string | null;
      ok: boolean;
    };
    config: { exists: boolean; mode: string | null; ok: boolean };
    privateKeys: Array<{ path: string; mode: string | null; ok: boolean }>;
    agentKeys: number | null;
  };
  homebrewSecurity?: {
    taps: Array<{ name: string; official: boolean }>;
    nonOfficialTaps: string[];
    services: Array<{ name: string; status: string; file: string | null }>;
  };
  ecosystems?: Record<string, Check>;
  browsers?: {
    profiles: Array<{
      browser: string;
      profile: string;
      extensionCount: number;
      unpackedCount: number;
      extensions: Array<{
        id: string;
        name: string | null;
        version: string | null;
        source: string;
      }>;
    }>;
  };
  applications?: {
    enabled?: boolean;
    scanned: number;
    unsigned: string[];
    rejected: string[];
    quarantined: string[];
    errors: string[];
  };
  secrets?: {
    checked: Array<{
      path: string;
      exists: boolean;
      mode: string | null;
      ok: boolean;
      kind: string;
    }>;
  };
  privileged?: {
    mode: string;
    approved: boolean;
    reason: string;
    commands: string[];
    interactive?: boolean;
  };
};

async function readSnapshot(context: ReportContext): Promise<Snapshot | null> {
  const candidates = context.scope === "workflow"
    ? (context.stepExecutions ?? []).flatMap((step) =>
      step.dataHandles.map((handle) => ({
        handle,
        modelType: step.modelType,
        modelId: step.modelId,
      }))
    )
    : (context.dataHandles ?? []).map((handle) => ({
      handle,
      modelType: context.modelType ?? "",
      modelId: context.modelId ?? "",
    }));

  const candidate = candidates.find((item) =>
    item.handle.specName === "snapshot"
  );
  if (!candidate || !candidate.modelType || !candidate.modelId) {
    return null;
  }

  const raw = await context.dataRepository.getContent(
    candidate.modelType,
    candidate.modelId,
    candidate.handle.name,
    candidate.handle.version,
  );
  if (!raw) {
    return null;
  }

  return JSON.parse(new TextDecoder().decode(raw)) as Snapshot;
}

function severityRank(severity: Finding["severity"]): number {
  if (severity === "critical") return 0;
  if (severity === "warn") return 1;
  return 2;
}

function renderFindings(findings: Finding[]): string {
  if (findings.length === 0) {
    return "No findings.\n";
  }

  const rows = findings
    .toSorted((a, b) =>
      severityRank(a.severity) - severityRank(b.severity) ||
      a.id.localeCompare(b.id)
    )
    .map((finding) =>
      `| ${finding.severity.toUpperCase()} | ${finding.category} | ${finding.title} | ${
        finding.detail.replaceAll("\n", " ")
      } |`
    );

  return [
    "| Severity | Category | Finding | Detail |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

function detailModeFromContext(context: ReportContext): DetailMode {
  const value = context.methodArgs?.detailMode;
  return value === "summary" || value === "findings" || value === "all"
    ? value
    : "all";
}

function markdownCell(value: string): string {
  return value.replaceAll("\n", " ").replaceAll("|", "\\|");
}

function formatValue(value: Check["value"]): string {
  if (value === null) return "unknown";
  return String(value);
}

function renderCheckTable(area: string, checks: Record<string, Check>): string {
  const rows = Object.entries(checks)
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([name, check]) =>
      `| ${area} | ${name} | ${check.status.toUpperCase()} | ${
        markdownCell(formatValue(check.value))
      } | ${markdownCell(check.detail ?? "")} |`
    );

  if (rows.length === 0) {
    return "No checks recorded.\n";
  }

  return [
    "| Area | Check | Status | Value | Detail |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

function renderPrivileged(snapshot: Snapshot): string {
  if (!snapshot.privileged) {
    return "No privileged probe metadata recorded.\n";
  }

  return [
    `- Mode: ${snapshot.privileged.mode}`,
    `- Approved: ${snapshot.privileged.approved}`,
    `- Interactive: ${snapshot.privileged.interactive ?? false}`,
    `- Reason: ${snapshot.privileged.reason}`,
    `- Commands: ${snapshot.privileged.commands.length}`,
    "",
  ].join("\n");
}

function renderPath(snapshot: Snapshot): string {
  if (!snapshot.path) {
    return "No PATH hygiene data recorded.\n";
  }

  const rows = snapshot.path.directories.map((directory) =>
    `| ${directory.index} | ${
      markdownCell(directory.path)
    } | ${directory.exists} | ${directory.standard} | ${directory.relative} | ${
      directory.mode ?? "unknown"
    } | ${directory.groupOrWorldWritable} | ${directory.commandCount} | ${
      markdownCell(directory.shadowedSystemCommands.slice(0, 10).join(", "))
    } |`
  );

  return [
    `- Duplicate directories: ${snapshot.path.duplicateDirectories.length}`,
    "",
    "| Index | Directory | Exists | Standard | Relative | Mode | Writable | Commands | Shadows |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

function renderSafeguards(snapshot: Snapshot): string {
  if (!snapshot.safeguards) {
    return "No package-manager safeguard data recorded.\n";
  }

  const safeguards = snapshot.safeguards;
  return [
    "| Tool | Present | Check | Status | Detail |",
    "| --- | --- | --- | --- | --- |",
    `| npm | ${safeguards.npm.present} | audit | ${safeguards.npm.audit.status.toUpperCase()} | ${
      markdownCell(safeguards.npm.audit.detail ?? "")
    } |`,
    `| npm | ${safeguards.npm.present} | ignore-scripts | ${safeguards.npm.ignoreScripts.status.toUpperCase()} | ${
      markdownCell(safeguards.npm.ignoreScripts.detail ?? "")
    } |`,
    `| npm | ${safeguards.npm.present} | package-lock | ${safeguards.npm.packageLock.status.toUpperCase()} | ${
      markdownCell(safeguards.npm.packageLock.detail ?? "")
    } |`,
    `| socket | ${safeguards.socket.present} | installed | ${
      safeguards.socket.present ? "PASS" : "UNKNOWN"
    } | ${markdownCell(safeguards.socket.path ?? "")} |`,
    `| deno | ${safeguards.deno.present} | installed | ${
      safeguards.deno.present ? "PASS" : "UNKNOWN"
    } | ${
      markdownCell(safeguards.deno.version ?? safeguards.deno.path ?? "")
    } |`,
    `| pipx | ${safeguards.pipx.present} | installed | ${
      safeguards.pipx.present ? "PASS" : "UNKNOWN"
    } | ${markdownCell(safeguards.pipx.path ?? "")} |`,
    "",
  ].join("\n");
}

function renderRecommendations(snapshot: Snapshot): string {
  if (!snapshot.recommendations) {
    return "No tool recommendations recorded.\n";
  }

  const rows = snapshot.recommendations.map((tool) =>
    `| ${tool.name} | ${tool.category} | ${tool.installed} | ${
      markdownCell(tool.detectedPath ?? tool.installHint)
    } | ${markdownCell(tool.rationale)} |`
  );

  return [
    "| Tool | Category | Installed | Path / Install Hint | Rationale |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

function renderManagement(snapshot: Snapshot): string {
  if (!snapshot.management) return "No management data recorded.\n";
  return [
    `- Enrollment: ${snapshot.management.enrollment.status.toUpperCase()} (${
      snapshot.management.enrollment.detail ?? "unknown"
    })`,
    `- Profiles readable: ${snapshot.management.profiles.readable}`,
    `- Profiles installed: ${snapshot.management.profiles.count}`,
    `- Profiles error: ${snapshot.management.profiles.error ?? "none"}`,
    "",
  ].join("\n");
}

function renderSystemExtensions(snapshot: Snapshot): string {
  if (!snapshot.systemExtensions) return "No system extension data recorded.\n";
  const rows = snapshot.systemExtensions.entries.slice(0, 50).map((entry) =>
    `| ${entry.category} | ${entry.teamId ?? ""} | ${entry.bundleId ?? ""} | ${
      entry.state ?? ""
    } | ${markdownCell(entry.raw)} |`
  );
  return [
    `- Readable: ${snapshot.systemExtensions.readable}`,
    `- Count: ${snapshot.systemExtensions.count}`,
    `- Error: ${snapshot.systemExtensions.error ?? "none"}`,
    "",
    "| Category | Team ID | Bundle ID | State | Raw |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

function renderPersistenceAndTcc(snapshot: Snapshot): string {
  const background = snapshot.persistence?.backgroundItems;
  const tcc = snapshot.tcc;
  const tccRows = Object.entries(tcc?.grantsByService ?? {})
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([service, count]) => `| ${service} | ${count} |`);
  return [
    "#### Background Items",
    "",
    `- Readable: ${background?.readable ?? false}`,
    `- Count: ${background?.count ?? 0}`,
    `- Error: ${background?.error ?? "none"}`,
    "",
    "#### TCC Grants",
    "",
    `- Readable: ${tcc?.readable ?? false}`,
    `- Database: ${tcc?.database ?? "unknown"}`,
    `- Error: ${tcc?.error ?? "none"}`,
    "",
    "| Service | Grants |",
    "| --- | --- |",
    ...tccRows,
    "",
  ].join("\n");
}

function renderSshAndSecrets(snapshot: Snapshot): string {
  const ssh = snapshot.ssh;
  const secretRows = (snapshot.secrets?.checked ?? []).map((item) =>
    `| ${item.kind} | ${markdownCell(item.path)} | ${item.exists} | ${
      item.mode ?? ""
    } | ${item.ok} |`
  );
  const keyRows = (ssh?.privateKeys ?? []).map((key) =>
    `| ${markdownCell(key.path)} | ${key.mode ?? ""} | ${key.ok} |`
  );
  return [
    "#### SSH",
    "",
    `- Directory: ${ssh?.directory.path ?? "unknown"} mode ${
      ssh?.directory.mode ?? "unknown"
    } ok ${ssh?.directory.ok ?? false}`,
    `- Config exists: ${ssh?.config.exists ?? false} mode ${
      ssh?.config.mode ?? "unknown"
    } ok ${ssh?.config.ok ?? false}`,
    `- Agent keys: ${ssh?.agentKeys ?? "unknown"}`,
    "",
    "| Private Key | Mode | OK |",
    "| --- | --- | --- |",
    ...keyRows,
    "",
    "#### Credential File Permissions",
    "",
    "| Kind | Path | Exists | Mode | OK |",
    "| --- | --- | --- | --- | --- |",
    ...secretRows,
    "",
  ].join("\n");
}

function renderHomebrewAndEcosystems(snapshot: Snapshot): string {
  const brew = snapshot.homebrewSecurity;
  const ecosystemRows = Object.entries(snapshot.ecosystems ?? {}).map((
    [name, check],
  ) =>
    `| ${name} | ${check.status.toUpperCase()} | ${
      markdownCell(check.detail ?? formatValue(check.value))
    } |`
  );
  return [
    "#### Homebrew",
    "",
    `- Taps: ${brew?.taps.length ?? 0}`,
    `- Non-official taps: ${brew?.nonOfficialTaps.join(", ") || "none"}`,
    `- Services: ${brew?.services.length ?? 0}`,
    "",
    "#### Language Ecosystems",
    "",
    "| Check | Status | Detail |",
    "| --- | --- | --- |",
    ...ecosystemRows,
    "",
  ].join("\n");
}

function renderBrowsersAndApps(snapshot: Snapshot): string {
  const browserRows = (snapshot.browsers?.profiles ?? []).map((profile) =>
    `| ${profile.browser} | ${profile.profile} | ${profile.extensionCount} | ${profile.unpackedCount} |`
  );
  const apps = snapshot.applications;
  return [
    "#### Browser Extensions",
    "",
    "| Browser | Profile | Extensions | Unpacked |",
    "| --- | --- | --- | --- |",
    ...browserRows,
    "",
    "#### Applications",
    "",
    `- Enabled: ${apps?.enabled ?? false}`,
    `- Scanned: ${apps?.scanned ?? 0}`,
    `- Unsigned / codesign failures: ${apps?.unsigned.length ?? 0}`,
    `- Gatekeeper rejected: ${apps?.rejected.length ?? 0}`,
    `- Quarantined: ${apps?.quarantined.length ?? 0}`,
    `- Assessment errors/timeouts: ${apps?.errors.length ?? 0}`,
    "",
  ].join("\n");
}

function renderMarkdown(snapshot: Snapshot, detailMode: DetailMode): string {
  const sections = [
    "# macOS Doctor Report",
    "",
    `- Host: ${snapshot.host.hostname ?? "unknown"}`,
    `- OS: ${
      [
        snapshot.os.productName,
        snapshot.os.productVersion,
        snapshot.os.buildVersion,
      ].filter(Boolean).join(" ")
    }`,
    `- Collected: ${snapshot.collectedAt}`,
    `- Findings: ${snapshot.summary.critical} critical, ${snapshot.summary.warn} warning, ${snapshot.summary.info} info`,
    "",
    "## Performance",
    "",
    `- Root disk used: ${
      snapshot.performance.rootDiskUsedPercent ?? "unknown"
    }%`,
    `- Memory free: ${snapshot.performance.memoryFreePercent ?? "unknown"}%`,
    `- 1m load average: ${snapshot.performance.loadAverage1m ?? "unknown"}`,
    "",
    "## Local Surface",
    "",
    `- Launchd plists scanned: ${snapshot.launchd.plistCount}`,
    `- Writable launchd plists: ${snapshot.launchd.writablePlists.length}`,
    `- Listening TCP sockets visible: ${snapshot.network.listeners.length}`,
    `- Homebrew present: ${snapshot.homebrew.present}`,
    `- Homebrew outdated: ${
      snapshot.homebrew.outdatedFormulae === null ||
        snapshot.homebrew.outdatedCasks === null
        ? "unknown"
        : `${snapshot.homebrew.outdatedFormulae} formulae, ${snapshot.homebrew.outdatedCasks} casks`
    }`,
  ];

  if (detailMode === "findings" || detailMode === "all") {
    sections.push("", "## Findings", "", renderFindings(snapshot.findings));
  }

  if (detailMode === "all") {
    sections.push(
      "",
      "## Checks",
      "",
      "### Security",
      "",
      renderCheckTable("security", snapshot.security),
      "",
      "### Updates",
      "",
      renderCheckTable("updates", snapshot.updates),
      "",
      "### PATH Hygiene",
      "",
      renderPath(snapshot),
      "",
      "### Package-Manager Safeguards",
      "",
      renderSafeguards(snapshot),
      "",
      "### Suggested Free Security Tools",
      "",
      renderRecommendations(snapshot),
      "",
      "### Management",
      "",
      renderManagement(snapshot),
      "",
      "### System Extensions",
      "",
      renderSystemExtensions(snapshot),
      "",
      "### Persistence And Privacy",
      "",
      renderPersistenceAndTcc(snapshot),
      "",
      "### SSH And Secrets",
      "",
      renderSshAndSecrets(snapshot),
      "",
      "### Homebrew And Ecosystems",
      "",
      renderHomebrewAndEcosystems(snapshot),
      "",
      "### Browsers And Applications",
      "",
      renderBrowsersAndApps(snapshot),
      "",
      "### Privileged Probes",
      "",
      renderPrivileged(snapshot),
    );
  }

  return sections.join("\n");
}

/**
 * Markdown and JSON report for macOS Doctor snapshots.
 *
 * Human runs default to the full detail view; callers can request the terse
 * findings view with `detailMode=findings` when they only need issues.
 */
export const report = {
  name: "@alvagante/macos-doctor-report",
  description: "Severity-rated report for macOS Doctor posture snapshots",
  scope: "method",
  labels: ["macos", "security", "audit", "performance"],
  execute: async (context: ReportContext) => {
    const snapshot = await readSnapshot(context);
    const detailMode = detailModeFromContext(context);
    if (!snapshot) {
      return {
        markdown:
          "# macOS Doctor Report\n\nNo snapshot data was produced by this run.\n",
        json: { status: "no_data" },
      };
    }

    return {
      markdown: renderMarkdown(snapshot, detailMode),
      json: {
        status: "ok",
        detailMode,
        collectedAt: snapshot.collectedAt,
        host: snapshot.host,
        os: snapshot.os,
        summary: snapshot.summary,
        findings: snapshot.findings,
        checks: detailMode === "all"
          ? {
            security: snapshot.security,
            updates: snapshot.updates,
            path: snapshot.path ?? null,
            safeguards: snapshot.safeguards ?? null,
            recommendations: snapshot.recommendations ?? [],
            management: snapshot.management ?? null,
            systemExtensions: snapshot.systemExtensions ?? null,
            persistence: snapshot.persistence ?? null,
            tcc: snapshot.tcc ?? null,
            ssh: snapshot.ssh ?? null,
            homebrewSecurity: snapshot.homebrewSecurity ?? null,
            ecosystems: snapshot.ecosystems ?? null,
            browsers: snapshot.browsers ?? null,
            applications: snapshot.applications ?? null,
            secrets: snapshot.secrets ?? null,
            privileged: snapshot.privileged ?? null,
          }
          : undefined,
      },
    };
  },
};

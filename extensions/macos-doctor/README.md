# macOS Doctor

Read-only local macOS security, sanity, and performance checks for swamp.

The extension writes a dated posture snapshot and produces a severity-rated
report. It is intentionally diagnostic-only: it does not change macOS settings,
install updates, kill processes, unload launchd jobs, or modify files.

## Model

`@alvagante/macos-doctor`

## Method

```bash
swamp model create @alvagante/macos-doctor macos-doctor --json
swamp model method run macos-doctor check
```

For automation that only needs issue highlights, keep the report terse:

```bash
swamp model method run macos-doctor check --input detailMode=findings
```

Optional inputs:

- `includeHomebrew`: collect Homebrew version and outdated formula/cask counts.
- `includeListeners`: collect visible listening TCP sockets via `lsof`.
- `includeLaunchd`: inspect user and global launchd plist directories.
- `includeApplications`: scan top-level applications with `codesign`, `spctl`,
  and quarantine xattrs. Disabled by default because it is slower and can be
  noisy under restricted execution contexts.
- `includeSoftwareUpdateList`: run `softwareupdate --list`.
- `privilegedMode`: one of `skip`, `prompt`, or `run`. `prompt` shows the exact
  read-only `sudo` commands before running them and allows sudo to ask for a
  password; `run` executes `sudo -n` probes without prompting and fails closed
  if sudo requires authentication.
- `detailMode`: one of `summary`, `findings`, or `all`. Controls how much the
  generated report renders; `all` is the default for human interactive use.
  Agents and automation should prefer `detailMode=findings` when the goal is
  only to highlight issues or keep output terse.
- `commandTimeoutMs`: timeout for individual commands.

## Checks

- FileVault, SIP, Gatekeeper, firewall, Remote Login, Remote Apple Events.
- XProtect and Gatekeeper package metadata.
- Software Update preferences and optional available-update scan.
- Root filesystem pressure.
- Memory pressure, load average, and top CPU processes.
- Listening TCP sockets visible to the current user.
- LaunchAgent and LaunchDaemon plist writability.
- Homebrew version and outdated package counts when `brew` is present.
- PATH hygiene: missing, duplicate, relative, writable, and command-shadowing
  entries.
- Package-manager safeguards for npm plus presence checks for Socket, Deno, and
  pipx.
- Informational suggestions for common free macOS security tools such as LuLu,
  KnockKnock, BlockBlock, osquery, and Santa.
- Management, system extension, background item, and TCC visibility where the
  current session can read them.
- SSH and local credential-file permission checks without reading secret
  contents.
- Homebrew taps/services, language ecosystem registries/checksum settings,
  browser extension counts, and top-level application signing/quarantine state.

## Outputs

- Resource `snapshot/current`: full JSON snapshot with findings.
- Report `@alvagante/macos-doctor-report`: markdown and JSON summary.

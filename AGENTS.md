<!-- BEGIN swamp managed section - DO NOT EDIT -->
# Project

This repository is managed with [swamp](https://github.com/systeminit/swamp).

## Rules

1. **Search before you build.** When automating AWS, APIs, or any external service: (a) search local types with `swamp model type search <query>`, (b) search community extensions with `swamp extension search <query>`, (c) if a community extension exists, install it with `swamp extension pull <package>` instead of building from scratch, (d) only create a custom extension model in `extensions/models/` if nothing exists. Read `.agents/skills/swamp-extension/SKILL.md` for guidance. The `command/shell` model is ONLY for ad-hoc one-off shell commands, NEVER for wrapping CLI tools or building integrations.
2. **Extend, don't be clever.** When a model covers the domain but lacks the method you need, extend it with `export const extension` — don't bypass it with shell scripts, CLI tools, or multi-step hacks. One method, one purpose. Use `swamp model type describe <type> --json` to check available methods.
3. **Use the data model.** Once data exists in a model (via `lookup`, `start`, `sync`, etc.), reference it with CEL expressions. Don't re-fetch data that's already available.
4. **CEL expressions everywhere.** Wire models together with CEL expressions. Always prefer `data.latest("<name>", "<dataName>").attributes.<field>` over the deprecated `model.<name>.resource.<spec>.<instance>.attributes.<field>` pattern.
5. **Verify before destructive operations.** Always `swamp model get <name> --json` and verify resource IDs before running delete/stop/destroy methods.
6. **Prefer fan-out methods over loops.** When operating on multiple targets, use a single method that handles all targets internally (factory pattern) rather than looping N separate `swamp model method run` calls against the same model. Multiple parallel calls against the same model contend on the per-model lock, causing timeouts. A single fan-out method acquires the lock once and produces all outputs in one execution. Check `swamp model type describe` for methods that accept filters or produce multiple outputs.
7. **Extension npm deps are bundled, not lockfile-tracked.** Swamp's bundler inlines all npm packages (except zod) into extension bundles at bundle time. `deno.lock` and `package.json` do NOT cover extension model dependencies — this is by design. Always pin explicit versions in `npm:` import specifiers (e.g., `npm:lodash-es@4.17.21`).
8. **Reports for reusable data pipelines.** When the task involves building a repeatable pipeline to transform, aggregate, or analyze model output (security reports, cost analysis, compliance checks, summaries), create a report extension. Read `.agents/skills/swamp-report/SKILL.md` for guidance.

## Skills

**IMPORTANT:** Skills are detailed guides stored in `.agents/skills/`. When a task
matches a skill area below, read the corresponding `SKILL.md` file for guidance.

- `.agents/skills/swamp-getting-started/SKILL.md` - Interactive onboarding for new swamp users
- `.agents/skills/swamp-model/SKILL.md` - Work with swamp models (creating, editing, validating)
- `.agents/skills/swamp-workflow/SKILL.md` - Work with workflows (creating, editing, running)
- `.agents/skills/swamp-vault/SKILL.md` - Manage secrets and credentials
- `.agents/skills/swamp-data/SKILL.md` - Manage model data lifecycle and query with CEL
- `.agents/skills/swamp-report/SKILL.md` - Run and configure reports for models and workflows
- `.agents/skills/swamp-repo/SKILL.md` - Repository management
- `.agents/skills/swamp-extension/SKILL.md` - Create custom extensions (models, vaults, drivers, datastores, reports)
- `.agents/skills/swamp-extension-publish/SKILL.md` - Publish extensions to the registry
- `.agents/skills/swamp-issue/SKILL.md` - Submit bug reports and feature requests
- `.agents/skills/swamp-troubleshooting/SKILL.md` - Diagnose swamp problems and verify swamp's health

## Getting Started

**IMPORTANT:** At the start of every conversation, run
`swamp model search --json`. If no models are returned (empty result), you MUST
immediately read `.agents/skills/swamp-getting-started/SKILL.md` and follow its
instructions. This walks new users through an interactive onboarding tutorial.

If models already exist, start by reading `.agents/skills/swamp-model/SKILL.md`
to work with swamp models.

## Commands

Use `swamp --help` to see available commands. For a machine-readable JSON
schema of the CLI (commands, options, arguments) intended for agent
consumption, run `swamp help [<command>...]` — e.g. `swamp help` returns
the full tree, and `swamp help model method run` scopes to a subtree.
<!-- END swamp managed section -->

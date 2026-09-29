# @alvagante/loopq

Repo-scoped agent guidance for using [loopq](https://github.com/alvagante/loopq), a local CLI for coordinating coding agents through fragments, review, and integration. The extension bundles the Loopq skill and its setup, work, monitor, act, and run references. Swamp installs the skill in the current repository's agent-skill directory when this extension is pulled.

## Installation

```sh
swamp extension pull @alvagante/loopq
```

Then ask the agent to use the `loopq` skill for the loop task. In Codex, invoke it with:

```text
$loopq Check the current loop and tell me what needs attention.
```

## Scope

This package supplies passive guidance. It does not add Swamp model methods, run loopq commands during installation, create loop configuration, or change Git branches, worktrees, or schedules. The skill guides the agent through the installed `loopq` CLI and requires approval before setup writes loop configuration or creates Git state.

Pulling the extension installs the skill for this repository. It does not create global skill links in agent-harness directories. Operating a loop requires the `loopq` CLI on `PATH`; the skill can guide its installation. Loopq also requires Git, `uv`, and Python 3.11 or newer.

## License

Apache 2.0. See [LICENSE](LICENSE). The bundled skill comes from the Loopq project, which is also distributed under Apache 2.0.

## Maintaining the bundle

The Loopq repository's `skills/loopq/` is the source of truth. In a checkout of this source repository, copy and compare it with the packaged skill using:

```sh
extensions/loopq/sync-skill.sh --update /path/to/loopq
extensions/loopq/sync-skill.sh --check /path/to/loopq
```

The script leaves extra packaged files in place and reports the difference for review. After a skill update, bump the manifest version and run an extension push dry run before publishing.

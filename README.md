# Alvagante Swamp Extensions

Shareable swamp extensions maintained in this repository.

## Extensions

| Extension | Description |
| --- | --- |
| `@alvagante/macos-doctor` | Read-only local macOS security, sanity, and performance posture checks with a severity-rated report. |
| `@alvagante/docker-image-test` | Local Docker image smoke testing: build image matrices, run containers, poll health checks, capture logs, and clean up. |
| `@alvagante/youtube-content-pack` | Generate timestamped publishing assets from owned or user-supplied YouTube video metadata and transcripts. |

## Installation

```bash
swamp extension pull @alvagante/macos-doctor
swamp extension pull @alvagante/docker-image-test
swamp extension pull @alvagante/youtube-content-pack
```

## Development

Each extension is a standalone package under `extensions/<name>/`.

```bash
cd extensions/macos-doctor
deno task check
swamp extension fmt manifest.yaml --check
swamp extension push manifest.yaml --dry-run
```

Use the same commands from `extensions/docker-image-test` for the Docker image test extension.

## Notes

The `docs/` directory contains exploratory writing and design notes. It is not part of the extension publish surface.

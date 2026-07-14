# Alvagante Swamp Extensions

Shareable swamp extensions maintained in this repository.

## Extensions

| Extension | Description |
| --- | --- |
| `@alvagante/content-blog-post` | Generate publication-ready blog posts using Claude, an OpenAI-compatible endpoint, or agent-written content. |
| `@alvagante/content-card` | Generate playing-card-shaped content images with configurable sequences, skill levels, icons, logos, and styles. |
| `@alvagante/content-cheatsheet` | Generate structured technical cheatsheets as print-ready HTML or GitHub-flavoured Markdown. |
| `@alvagante/content-iam` | Generate self-narrated editorial biography minisites for real people, fictional characters, or AI personas. |
| `@alvagante/content-image` | Generate images with the OpenAI Images API using transparent output and configurable style presets. |
| `@alvagante/content-infographic` | Generate browser-ready infographic pages with an image, reliable HTML text shell, and embeddable output. |
| `@alvagante/content-ixen` | Generate self-narrated, mixed-media technical teaching pages as self-contained HTML. |
| `@alvagante/content-music` | Generate songs from topics using Claude for lyrics and 1min.ai for audio. |
| `@alvagante/content-social` | Generate platform-shaped post drafts for Facebook, X, LinkedIn, TikTok, and Instagram. |
| `@alvagante/content-timeline` | Generate self-contained, factually grounded HTML timelines for biographical, historical, project, or technical subjects. |
| `@alvagante/docker-image-test` | Local Docker image smoke testing: build image matrices, run containers, poll health checks, capture logs, and clean up. |
| `@alvagante/macos-doctor` | Read-only local macOS security, sanity, and performance posture checks with a severity-rated report. |
| `@alvagante/youtube-content-pack` | Generate timestamped publishing assets from owned or user-supplied YouTube video metadata and transcripts. |

## Installation

```bash
swamp extension pull @alvagante/content-blog-post
swamp extension pull @alvagante/content-card
swamp extension pull @alvagante/content-cheatsheet
swamp extension pull @alvagante/content-course
swamp extension pull @alvagante/content-iam
swamp extension pull @alvagante/content-image
swamp extension pull @alvagante/content-infographic
swamp extension pull @alvagante/content-ixen
swamp extension pull @alvagante/content-music
swamp extension pull @alvagante/content-social
swamp extension pull @alvagante/content-timeline
swamp extension pull @alvagante/docker-image-test
swamp extension pull @alvagante/macos-doctor
swamp extension pull @alvagante/youtube-content-pack
```

## Development

Each extension is a standalone package under `extensions/<name>/`.

```bash
cd extensions/<name>
deno task check
swamp extension fmt manifest.yaml --check
swamp extension push manifest.yaml --dry-run
```

## Notes

The `docs/` directory contains exploratory writing and design notes. It is not part of the extension publish surface.

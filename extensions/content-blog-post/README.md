# @alvagante/content-blog-post

Generate publication-ready blog posts on any topic using the Anthropic Claude API or any OpenAI-compatible endpoint — or save posts written by the calling agent with no API key at all. Configure the technical depth (novice to guru), output length (short/medium/long), writing persona, and which model to call.

## Installation

```sh
swamp extension install @alvagante/content-blog-post
```

## Setup

### Agent-driven (no keys)

If the model is driven by a coding agent (Claude Code, etc.) that writes the post itself, no inference configuration is needed:

```sh
swamp model create "@alvagante/content-blog-post" my-blog
```

Then use the `save` method (see below). The global arguments are only required for the `generate` method.

### Anthropic (default)

```sh
swamp model create "@alvagante/content-blog-post" my-blog \
  --global-arg apiKey=<YOUR_ANTHROPIC_API_KEY>
```

### OpenAI-compatible endpoint (Ollama, vLLM, Groq, OpenRouter, …)

```sh
swamp model create "@alvagante/content-blog-post" my-blog-local \
  --global-arg apiFormat=openai-compat \
  --global-arg baseUrl=http://localhost:11434/v1
```

Omit `apiKey` for local providers that don't require authentication. For hosted providers (Groq, Together, etc.) add `--global-arg apiKey=<KEY>`.

Global arguments (used by `generate` only — `save` needs none):

| Argument    | Required | Default                        | Description                                         |
| ----------- | -------- | ------------------------------ | --------------------------------------------------- |
| `apiFormat` | No       | `anthropic`                    | `anthropic` or `openai-compat`                      |
| `apiKey`    | `generate` with Anthropic | —             | API key; stored in vault, never logged              |
| `baseUrl`   | No       | Anthropic or `localhost:11434` | Override the inference endpoint base URL            |

`apiKey` is stored in the swamp vault and never logged.

## Usage

### `generate` — endpoint-driven

```sh
swamp model method run my-blog generate \
  --arg topic="Why Puppet is still relevant in a Kubernetes world" \
  --arg skillLevel=senior \
  --arg outputLength=medium \
  --arg persona=alvabot
```

Arguments:

| Argument       | Required | Values                                   | Default          |
| -------------- | -------- | ---------------------------------------- | ---------------- |
| `topic`        | Yes      | Any string                               | —                |
| `details`      | No       | Extra context or constraints             | —                |
| `skillLevel`   | No       | `novice`, `intermediate`, `senior`, `guru` | `intermediate`   |
| `outputLength` | No       | `short`, `medium`, `long`                | `medium`         |
| `model`        | No       | Any Claude model ID                      | `claude-opus-4-8` |
| `persona`      | No       | `neutral`, `alvabot`, `cybergeek`, `abnormalia`, `noir`, `glitchpoet`, `fieldnotes`, `oracle`, `baroque`, `deadpan`, `gonzo`, `punkprof` | `neutral`        |
| `personaDescription` | No | Free-text voice directive; overrides `persona` | —          |

### `save` — agent-driven, keyless

When the calling agent writes the post itself, store it without any inference call:

```sh
swamp model method run my-blog save \
  --arg topic="Why Puppet is still relevant in a Kubernetes world" \
  --arg content="$(cat post.md)" \
  --arg persona=alvabot
```

Arguments:

| Argument       | Required | Values                                   | Default               |
| -------------- | -------- | ---------------------------------------- | --------------------- |
| `content`      | Yes      | Full post in Markdown (first line = title) | —                   |
| `title`        | No       | Override; otherwise taken from first line of content | —        |
| `topic`        | Yes      | Any string                               | —                     |
| `details`      | No       | Extra context recorded as metadata       | —                     |
| `skillLevel`   | No       | `novice`, `intermediate`, `senior`, `guru` | `intermediate`      |
| `outputLength` | No       | `short`, `medium`, `long`                | Derived from word count |
| `model`        | No       | Identifier of whatever produced the content | `external`         |
| `persona`      | No       | `neutral`, `alvabot`, `cybergeek`, `abnormalia`, `noir`, `glitchpoet`, `fieldnotes`, `oracle`, `baroque`, `deadpan`, `gonzo`, `punkprof` | `neutral`             |
| `personaDescription` | No | Free-text voice description recorded as metadata | —            |

Output is identical to `generate`: a `post` resource and a `markdown` file.

### Reading the output

After generation, the post is available as a structured resource and a Markdown file:

```sh
# Read the structured resource (title, wordCount, metadata)
swamp model get my-blog --json

# Access the Markdown file path via CEL
swamp data latest my-blog markdown
```

## Personas

- **neutral** — clear, professional, no particular voice signature
- **alvabot** — Alessandro Franceschi (example42 blog) voice: pragmatic, first-person, DevOps-deep, dry humor, candid about tradeoffs
- **cybergeek** — cyberpunk-inflected prose: sharp, unsentimental, technically dense, trusts the reader completely
- **abnormalia** — concise, witty, self-ironic, visually playful, occasionally interrupted, geek-culture aware
- **noir** — hardboiled technical noir: terse, atmospheric, suspicious of easy answers
- **glitchpoet** — fragmented, rhythmic, image-rich, precise under the distortion
- **fieldnotes** — empirical notes from production: concrete, observational, first-hand
- **oracle** — compressed systems aphorisms, warnings, paradox, pattern recognition
- **baroque** — ornate engineering prose with elaborate analogies and exact conclusions
- **deadpan** — flat, sharp, understated, allergic to hype
- **gonzo** — first-person technical dispatches with kinetic, subjective energy
- **punkprof** — rigorous teaching with zine attitude and operational scars

For a custom voice, pass `personaDescription` with your own directive instead — it takes precedence over `persona`:

```sh
swamp model method run my-blog generate \
  --arg topic="Zero-downtime database migrations" \
  --arg personaDescription="Write as a grumpy SRE veteran: terse, war-story driven, allergic to hype, fond of postmortem-style honesty"
```

## How it works

`generate` calls the configured inference endpoint directly via `fetch`. In `anthropic` mode: `POST /v1/messages` with adaptive thinking enabled automatically for Opus 4.x, Fable, and Mythos models. In `openai-compat` mode: `POST /v1/chat/completions` with the system prompt as a `role: system` message — works with Ollama, vLLM, Groq, Together, OpenRouter, and any OpenAI-compatible provider. `save` skips inference entirely and stores caller-provided content. Both methods produce the same outputs:

- `post` resource — JSON with title, content, wordCount, and generation metadata
- `markdown` file — the raw Markdown post, ready to drop into any CMS or static site

## License

Apache 2.0 — see LICENSE.txt for details.

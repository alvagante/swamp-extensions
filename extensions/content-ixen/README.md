# @alvagante/content-ixen

Generate **Ixen pages** — self-narrated, mixed-media web pages in the tradition of [*I, Xen*](https://web.archive.org/web/2006/http://openskills.info/) (OpenSkills, 2005), where the technology itself speaks in first person about its own existence while teaching the reader real, accurate technical content.

> *I am conscious of what I do, how I perceive, think, act, behave in order to drive this ... life.*

An Ixen page alternates short, evocative, philosophical lines with concrete technical substance: realistic commands and outputs shown inline or in 2005-style pop-up windows. Since this is 2026 and no longer 2006, pages can also embed modern media — zoomable images, video, audio, and PDFs — always woven into the first-person narration. The narrator adapts to the topic: a hypervisor, an AI agent, a container, a git repository, a Kubernetes cluster... whatever is involved tells its own story.

The output is a **single self-contained HTML file** (CSS and JavaScript inlined) that opens directly in any browser.

## Installation

```sh
swamp extension install @alvagante/content-ixen
```

## Setup

### Agent-driven (no keys)

If the model is driven by a coding agent (Claude Code, etc.) that writes the page itself, no inference configuration is needed:

```sh
swamp model create "@alvagante/content-ixen" my-ixen
```

Then use the `save` method (see below). The global arguments are only required for the `generate` method.

### Anthropic (default)

```sh
swamp model create "@alvagante/content-ixen" my-ixen \
  --global-arg apiKey=<YOUR_ANTHROPIC_API_KEY>
```

### OpenAI-compatible endpoint (Ollama, vLLM, Groq, OpenRouter, …)

```sh
swamp model create "@alvagante/content-ixen" my-ixen-local \
  --global-arg apiFormat=openai-compat \
  --global-arg baseUrl=http://localhost:11434/v1
```

Omit `apiKey` for local providers that don't require authentication. For hosted providers add `--global-arg apiKey=<KEY>`.

Global arguments (used by `generate` only — `save` needs none):

| Argument    | Required                  | Default                        | Description                              |
| ----------- | ------------------------- | ------------------------------ | ---------------------------------------- |
| `apiFormat` | No                        | `anthropic`                    | `anthropic` or `openai-compat`           |
| `apiKey`    | `generate` with Anthropic | —                              | API key; stored in vault, never logged   |
| `baseUrl`   | No                        | Anthropic or `localhost:11434` | Override the inference endpoint base URL |

## Usage

### `generate` — endpoint-driven

```sh
swamp model method run my-ixen generate \
  --input topic="Life as a Kubernetes cluster" \
  --input narrator="a production Kubernetes cluster" \
  --input skillLevel=senior \
  --input media="https://www.youtube.com/embed/dQw4w9WgXcQ — the day I was bootstrapped"
```

Arguments:

| Argument       | Required | Values                                     | Default                |
| -------------- | -------- | ------------------------------------------ | ---------------------- |
| `topic`        | Yes      | Any string                                 | —                      |
| `narrator`     | No       | Who speaks (e.g. "a Xen host", "an AI agent") | Inferred from topic |
| `details`      | No       | Extra context or constraints               | —                      |
| `media`        | No       | Real media URLs to embed, one per line, optionally `URL — caption` | — |
| `skillLevel`   | No       | `novice`, `intermediate`, `senior`, `guru` | `intermediate`         |
| `outputLength` | No       | `short`, `medium`, `long`                  | `medium`               |
| `model`        | No       | Any model ID                               | `claude-opus-4-8`      |
| `credits`      | No       | Byline shown top-right (e.g. "txt by al")  | `txt by <model>`       |

Media URLs are never invented: only URLs you pass via `media` are embedded. Supported media types: zoomable images, embedded video (use embed-friendly URLs, e.g. `youtube.com/embed/<id>`), audio, and PDFs.

### `save` — agent-driven, keyless

When the calling agent writes the page body itself, store it without any inference call:

```sh
swamp model method run my-ixen save \
  --input topic="Life as a git repository" \
  --input narrator="a git repository" \
  --input content="$(cat page-body.html)"
```

For long bodies, prefer a YAML input file:

```sh
swamp model method run my-ixen save --input-file inputs.yaml
```

Arguments:

| Argument       | Required | Values                                          | Default                 |
| -------------- | -------- | ----------------------------------------------- | ----------------------- |
| `content`      | Yes      | Page body HTML (optional first line = plain-text title) | —              |
| `title`        | No       | Override; otherwise taken from first line of content | —                  |
| `narrator`     | Yes      | Who speaks                                      | —                       |
| `topic`        | Yes      | Any string                                      | —                       |
| `details`      | No       | Extra context recorded as metadata              | —                       |
| `media`        | No       | Media URLs recorded as metadata                 | —                       |
| `skillLevel`   | No       | `novice`, `intermediate`, `senior`, `guru`      | `intermediate`          |
| `outputLength` | No       | `short`, `medium`, `long`                       | Derived from word count |
| `model`        | No       | Identifier of whatever produced the content     | `external`              |
| `credits`      | No       | Byline shown top-right                          | `txt by <model>`        |

The `content` body must use the component vocabulary below. Output is identical to `generate`: a `page` resource and an `html` file.

### Reading the output

```sh
# Structured resource (title, narrator, wordCount, metadata)
swamp model get my-ixen --json

# Path of the self-contained HTML file
swamp data latest my-ixen html
```

Open the HTML file in any browser — no external dependencies.

## Component vocabulary

The page shell provides all CSS and JavaScript. Bodies (generated or saved) use only these structures:

| Component        | Markup                                                                 |
| ---------------- | ---------------------------------------------------------------------- |
| Binary line      | `<p class="binary">01001001 ...</p>`                                    |
| Narration        | `<p>... <strong>emphasis</strong> ...</p>`                              |
| Whispered line   | `<p class="whisper">s l o w  d o w n</p>`                               |
| Terminal line    | `<div class="term"><span class="host">zeus:~ $</span> <span class="cmd">uptime</span></div>` |
| Inline output    | `<pre class="output">...</pre>`                                         |
| Pop-up command   | `<button class="cmd popup-trigger" data-popup="id">cmd</button>` + `<aside class="popup" id="id" hidden>...<pre>...</pre></aside>` |
| Zoomable image   | `<figure class="zoom"><img src="URL" alt=""><figcaption>...</figcaption></figure>` |
| Video            | `<div class="media video"><iframe src="URL" allowfullscreen></iframe></div>` |
| Audio            | `<div class="media audio"><audio controls src="URL"></audio></div>`     |
| PDF              | `<div class="media pdf"><iframe src="URL"></iframe></div>`              |
| Chapter          | `<section class="chapter">...</section>`                                |

Pop-up command windows recreate the original *I, Xen* "Close Window" overlays; images open in a lightbox; Escape closes everything.

## A note on the form

The fiction is in the voice, never in the facts. Commands, flags, and outputs are realistic and plausible for the narrator's technology — an `uptime` becomes a meditation on lifespan, `su` becomes "your trips to privileged lands", spawning a guest becomes existential vertigo. The page teaches while it speaks.

The generated page embeds the body HTML as-is. Review pages before publishing them anywhere public, as you would any generated content.

## How it works

`generate` calls the configured inference endpoint directly via `fetch`. In `anthropic` mode: `POST /v1/messages` with adaptive thinking enabled automatically for Opus 4.x, Fable, and Mythos models. In `openai-compat` mode: `POST /v1/chat/completions` — works with Ollama, vLLM, Groq, Together, OpenRouter, and any OpenAI-compatible provider. `save` skips inference entirely and stores caller-provided content. Both methods produce the same outputs:

- `page` resource — JSON with title, narrator, body HTML, wordCount, and generation metadata
- `html` file — the complete self-contained Ixen page

## License

Apache 2.0 — see LICENSE.txt for details.

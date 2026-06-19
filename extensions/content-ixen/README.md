# @alvagante/content-ixen

Generate **Ixen pages** — self-narrated, mixed-media web pages in the tradition of [*I, Xen*](https://web.archive.org/web/2006/http://openskills.info/) (OpenSkills, 2005), where the technology itself speaks in first person about its own existence while teaching the reader real, accurate technical content.

> *I am conscious of what I do, how I perceive, think, act, behave in order to drive this ... life.*

An Ixen page alternates short, evocative, philosophical fragments with concrete technical substance: realistic commands and outputs shown inline or in 2005-style pop-up windows. Concept pages can also include one image, one compact slide popup, and one direct explanatory notes popup per configured concept. The main narrator voice inspires and implies; the popups carry the detailed explanation.

The output is a **single self-contained HTML file** (CSS and JavaScript inlined) that opens directly in any browser. When writing into an `outputDir`, existing generated Ixen output is rotated into numeric version directories (`1`, `2`, `3`, ...) before the new `index.html` is written. Pre-generated cheatsheet and infographic HTML files can be embedded inline near the bottom of the page.

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
| `outputDir` | No                        | —                              | Default directory for `index.html` and version rotation |

## Usage

### `generate` — endpoint-driven

```sh
swamp model method run my-ixen generate \
  --input topic="Life as a Kubernetes cluster" \
  --input narrator="a production Kubernetes cluster" \
  --input skillLevel=senior \
  --input 'concepts:json=[{"name":"Scheduling","details":"Pod placement, predicates, scoring, preemption.","imagePrompt":"A precise technical diagram of Kubernetes scheduling queues","imageFilename":"scheduling.png"}]' \
  --input outputDir=/tmp/ixen-site
```

Arguments:

| Argument       | Required | Values                                     | Default                |
| -------------- | -------- | ------------------------------------------ | ---------------------- |
| `topic`        | Yes      | Any string                                 | —                      |
| `narrator`     | No       | Who speaks (e.g. "a Xen host", "an AI agent") | Inferred from topic |
| `details`      | No       | Extra context or constraints               | —                      |
| `media`        | No       | Real media URLs to embed, one per line, optionally `URL — caption` | — |
| `mediaItems`   | No       | Array of `{path,prompt}` image items       | —                      |
| `concepts`     | No       | Ordered array of `{name,details,imagePrompt,imagePath,imageFilename}` | Derived from `mediaItems` |
| `skillLevel`   | No       | `novice`, `intermediate`, `senior`, `guru` | `intermediate`         |
| `outputLength` | No       | `short`, `medium`, `long`                  | `medium`               |
| `model`        | No       | Any model ID                               | `claude-opus-4-8`      |
| `persona`      | No       | `neutral`, `alvabot`, `abnormalia`         | `neutral`              |
| `personaDescription` | No | Custom voice directive overriding `persona` | —                     |
| `credits`      | No       | Optional top-right byline before the timestamp | —            |
| `headerContent` | No      | Raw HTML fragment rendered below the Ixen header | —                 |
| `footerContent` | No      | Raw HTML fragment rendered after the body and inline embeds | —           |
| `outputDir`    | No       | Directory path                             | Global `outputDir`     |
| `versionOutput` | No      | `true` or `false`                          | `true`                 |
| `cheatsheetPath` | No     | Relative HTML path embedded near the bottom of the page | —           |
| `infographicPath` | No    | Relative infographic HTML path embedded near the bottom of the page | —   |
| `infographicPaths` | No   | Array of relative infographic HTML paths   | —                      |
| `infographics` | No      | Array of `{path,title}` infographic embeds | —                      |

Media URLs are never invented: only URLs you pass via `media` are embedded. Supported media types: zoomable images, embedded video (use embed-friendly URLs, e.g. `youtube.com/embed/<id>`), audio, and PDFs.

For workflow composition, call `prepare` before upstream media generators write into the shared `outputDir`, then call `generate` with `versionOutput=false`. That preserves the previous page and its referenced images/audio/cheatsheet/infographic files before new files overwrite root filenames.

### `prepare` — rotate an existing output directory

```sh
swamp model method run my-ixen prepare --input outputDir=/tmp/ixen-site
```

`prepare` moves an existing generated `index.html` and the root-local files it references into the next numeric subdirectory. It only rotates pages containing the `@alvagante/content-ixen` marker.

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
| `mediaItems`   | No       | Array of `{path,prompt}` image items            | —                       |
| `concepts`     | No       | Ordered array of concept metadata               | Derived from `mediaItems` |
| `skillLevel`   | No       | `novice`, `intermediate`, `senior`, `guru`      | `intermediate`          |
| `outputLength` | No       | `short`, `medium`, `long`                       | Derived from word count |
| `model`        | No       | Identifier of whatever produced the content     | `external`              |
| `persona`      | No       | `neutral`, `alvabot`, `abnormalia`              | `neutral`               |
| `personaDescription` | No | Custom voice directive overriding `persona`     | —                       |
| `credits`      | No       | Optional top-right byline before the timestamp | —                       |
| `headerContent` | No      | Raw HTML fragment rendered below the Ixen header | —                      |
| `footerContent` | No      | Raw HTML fragment rendered after the body and inline embeds | —                |
| `outputDir`    | No       | Directory path                                  | Global `outputDir`      |
| `versionOutput` | No      | Rotate previous generated output first          | `true`                  |
| `cheatsheetPath` | No     | Relative HTML path embedded near the bottom of the page | —              |
| `infographicPath` | No    | Relative infographic HTML path embedded near the bottom of the page | —   |
| `infographicPaths` | No   | Array of relative infographic HTML paths        | —                       |
| `infographics` | No      | Array of `{path,title}` infographic embeds      | —                       |

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
| Whispered line   | `<p class="whisper">waiting between interrupts</p>`                      |
| Terminal line    | `<div class="term"><span class="host">zeus:~ $</span> <span class="cmd">uptime</span></div>` |
| Inline output    | `<pre class="output">...</pre>`                                         |
| Pop-up command   | `<button class="cmd popup-trigger" data-popup="id">cmd</button>` + `<aside class="popup" id="id" hidden>...<pre>...</pre></aside>` |
| Concept controls | `<div class="concept-tools"><button class="cmd popup-trigger concept-btn" data-popup="id">slide</button>...</div>` |
| Concept slide    | `<aside class="popup concept-slide" id="id" hidden>...terse slide content...</aside>` |
| Concept notes    | `<aside class="popup concept-note" id="id" hidden>...direct explanatory text...</aside>` |
| Zoomable image   | `<figure class="zoom"><img src="URL" alt=""><figcaption>...</figcaption></figure>` |
| Infographic      | Passed as `infographicPath`, `infographicPaths`, or `infographics`; rendered by the Ixen shell |
| Video            | `<div class="media video"><iframe src="URL" allowfullscreen></iframe></div>` |
| Audio            | `<div class="media audio"><audio controls src="URL"></audio></div>`     |
| PDF              | `<div class="media pdf"><iframe src="URL"></iframe></div>`              |
| Chapter          | `<section class="chapter">...</section>`                                |

Pop-up command windows recreate the original *I, Xen* "Close Window" overlays; images open in a lightbox; Escape closes everything.
When the page contains concept slide or note popups, the shell adds top-right `all slides` and `all notes` buttons that open aggregate popups built from the same linked concept material.

## A note on the form

The fiction is in the voice, never in the facts. Commands, flags, and outputs are realistic and plausible for the narrator's technology — an `uptime` becomes a meditation on lifespan, `su` becomes "your trips to privileged lands", spawning a guest becomes existential vertigo. The page teaches while it speaks.

The generated page embeds the body HTML as-is. Review pages before publishing them anywhere public, as you would any generated content.

## How it works

`generate` calls the configured inference endpoint directly via `fetch`. In `anthropic` mode: `POST /v1/messages` with adaptive thinking enabled automatically for Opus 4.x, Fable, and Mythos models. In `openai-compat` mode: `POST /v1/chat/completions` — works with Ollama, vLLM, Groq, Together, OpenRouter, and any OpenAI-compatible provider. `save` skips inference entirely and stores caller-provided content. When `infographicPath`, `infographicPaths`, or `infographics` are supplied, the shell renders those relative HTML files in iframes before any cheatsheet embed. Both methods produce the same outputs:

- `page` resource — JSON with title, narrator, body HTML, wordCount, and generation metadata
- `html` file — the complete self-contained Ixen page

## License

Apache 2.0 — see LICENSE.txt for details.

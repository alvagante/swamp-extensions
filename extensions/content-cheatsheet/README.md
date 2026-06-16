# @alvagante/content-cheatsheet

Generate dense, visually structured **cheatsheets** on any technical topic.

Output is either a **print-to-PDF-ready HTML file** — dark header, colour-coded sections, two-column item grids, callouts, tables, and a quick-reference bar — or a clean **GitHub-flavoured Markdown file**. Choose per run; the LLM generates natively in the selected format.

## Installation

```sh
swamp extension install @alvagante/content-cheatsheet
```

## Setup

### Agent-driven (no keys)

If a coding agent writes the cheatsheet content itself, no inference configuration is needed:

```sh
swamp model create "@alvagante/content-cheatsheet" my-cheatsheet
```

Then use the `save` method. Global arguments are only required for `generate`.

### Anthropic (default)

```sh
swamp model create "@alvagante/content-cheatsheet" my-cheatsheet \
  --global-arg apiKey=<YOUR_ANTHROPIC_API_KEY>
```

### OpenAI-compatible endpoint

```sh
swamp model create "@alvagante/content-cheatsheet" my-cheatsheet \
  --global-arg apiFormat=openai-compat \
  --global-arg baseUrl=http://localhost:11434/v1
```

Global arguments (used by `generate` only):

| Argument    | Required                  | Default                        | Description                            |
| ----------- | ------------------------- | ------------------------------ | -------------------------------------- |
| `apiFormat` | No                        | `anthropic`                    | `anthropic` or `openai-compat`         |
| `apiKey`    | `generate` with Anthropic | —                              | API key; stored in vault, never logged |
| `baseUrl`   | No                        | Anthropic or `localhost:11434` | Override inference endpoint base URL   |
| `outputDir` | No                        | —                              | Directory to also write the file       |

## Usage

### `generate` — LLM-driven

```sh
swamp model method run my-cheatsheet generate \
  --input topic="git" \
  --input skillLevel=senior \
  --input verbosity=standard \
  --input completeness=comprehensive \
  --input outputFormat=html
```

```sh
swamp model method run my-cheatsheet generate \
  --input topic="awk one-liners" \
  --input skillLevel=intermediate \
  --input verbosity=detailed \
  --input completeness=exhaustive \
  --input outputFormat=markdown
```

Arguments:

| Argument       | Required | Values                                       | Default          |
| -------------- | -------- | -------------------------------------------- | ---------------- |
| `topic`        | Yes      | Any string                                   | —                |
| `details`      | No       | Additional context or focus areas            | —                |
| `skillLevel`   | No       | `novice`, `intermediate`, `senior`, `guru`   | `intermediate`   |
| `verbosity`    | No       | `minimal`, `standard`, `detailed`            | `standard`       |
| `completeness` | No       | `essential`, `comprehensive`, `exhaustive`   | `comprehensive`  |
| `outputFormat` | No       | `html`, `markdown`                           | `html`           |
| `model`        | No       | Any model ID                                 | `claude-opus-4-8`|
| `outputDir`    | No       | Override the global `outputDir` for this run | —                |

**verbosity × completeness token budget:**

| verbosity \ completeness | essential | comprehensive | exhaustive |
| ------------------------ | --------- | ------------- | ---------- |
| minimal                  | 1 500     | 2 500         | 4 000      |
| standard                 | 2 500     | 4 000         | 6 000      |
| detailed                 | 4 000     | 6 000         | 9 000      |

### `save` — agent-driven, keyless

When a coding agent writes the cheatsheet body itself, store it without any inference call:

```sh
swamp model method run my-cheatsheet save \
  --input topic="Kubernetes RBAC" \
  --input outputFormat=html \
  --input content="$(cat body.html)"
```

For long content, prefer a YAML input file:

```sh
swamp model method run my-cheatsheet save --input-file inputs.yaml
```

Arguments:

| Argument       | Required | Values                                          | Default          |
| -------------- | -------- | ----------------------------------------------- | ---------------- |
| `content`      | Yes      | HTML body markup or Markdown                    | —                |
| `topic`        | Yes      | Subject of the cheatsheet                       | —                |
| `title`        | No       | Override; otherwise derived from first heading  | —                |
| `details`      | No       | Context recorded in the resource                | —                |
| `skillLevel`   | No       | `novice`, `intermediate`, `senior`, `guru`      | `intermediate`   |
| `verbosity`    | No       | `minimal`, `standard`, `detailed`               | `standard`       |
| `completeness` | No       | `essential`, `comprehensive`, `exhaustive`      | `comprehensive`  |
| `outputFormat` | No       | `html`, `markdown`                              | `html`           |
| `model`        | No       | Identifier of whatever produced the content     | `external`       |
| `outputDir`    | No       | Override the global `outputDir`                 | —                |

### Reading the output

```sh
# Structured resource (title, topic, skill level, word count, metadata)
swamp model get my-cheatsheet --json

# Path of the generated file
swamp data latest my-cheatsheet html      # for html output
swamp data latest my-cheatsheet markdown  # for markdown output
```

Open the HTML file in any browser, then **Cmd-P → Save as PDF** for a print-ready document.

## HTML component vocabulary (for `save` in html mode)

The page shell provides all CSS. Supply only the content between `<main>` tags.

| Component       | Class / Element                                                       |
| --------------- | --------------------------------------------------------------------- |
| Quick ref bar   | `<div class="cs-quickref">` with `cs-qr-label` + `cs-qr-items`       |
| Section         | `<section class="cs-section" data-color="blue\|green\|red\|purple\|orange\|teal">` |
| Section title   | `<h2 class="cs-section-title">`                                       |
| Items grid      | `<div class="cs-items">` → `<div class="cs-item">` → `cs-item-cmd` + `cs-item-desc` |
| Two-col grid    | `<div class="cs-grid">`                                               |
| Callout         | `<div class="cs-callout tip\|warning\|note">` + `<span class="cs-callout-label">` |
| Table           | `<table class="cs-table">`                                            |
| Code block      | `<pre class="cs-code"><code>…</code></pre>`                           |

## How it works

`generate` calls the configured inference endpoint via `fetch`. In `anthropic` mode: `POST /v1/messages` with adaptive thinking enabled for Opus 4.x, Fable, and Mythos models. In `openai-compat` mode: `POST /v1/chat/completions`. The LLM is given a system prompt that specifies the component vocabulary (for HTML) or Markdown rules, plus skill-level, verbosity, and completeness directives. `save` skips inference entirely.

Both methods produce:
- `cheatsheet` resource — JSON with title, topic, skill level, verbosity, completeness, word count, and generation metadata
- `html` file — self-contained print-to-PDF-ready HTML page (when `outputFormat=html`)
- `markdown` file — GitHub-flavoured Markdown (when `outputFormat=markdown`)

## License

Apache 2.0 — see LICENSE.txt for details.

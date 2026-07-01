# @alvagante/content-timeline

Generate self-contained HTML timelines for any subject — biographical, historical,
project, technology, or custom. Events are grouped into named phases with a warm
editorial aesthetic, suitable for standalone viewing or embedding in an iframe.

**Factual accuracy is a hard constraint.** The extension explicitly prohibits the
LLM from inventing dates or events. Every entry must be documented and verifiable.
Use `c. YYYY` for approximate dates rather than presenting guesses as fact.

## Timeline types

| Type | Use for |
|------|---------|
| `biographical` | A person's life (birth, education, works, death) |
| `historical` | An era, conflict, or period of history |
| `project` | Software, product, or organisational timeline |
| `technology` | Invention, standards, versions, obsolescence |
| `custom` | Anything else — supply context in `details` |

## Methods

### `generate`

Calls the configured LLM to produce the timeline. Requires an API key.

```bash
swamp model method run generate my-timeline \
  --subject "Franz Kafka" \
  --timelineType biographical \
  --density standard \
  --model claude-opus-4-8 \
  --filename timeline.html \
  --outputDir iam/kafka
```

### `save`

Stores caller-written HTML (tl-phase / tl-event markup) without an LLM call.
Wraps the markup in the full page shell.

```bash
swamp model method run save my-timeline \
  --subject "My Project" \
  --content "<div class=\"tl-phase\" ...>...</div>" \
  --outputDir output/
```

## Global arguments

| Argument | Default | Description |
|----------|---------|-------------|
| `apiFormat` | `anthropic` | `anthropic` or `openai-compat` |
| `apiKey` | — | API key (sensitive) |
| `baseUrl` | format default | Override API base URL |
| `outputDir` | — | Default output directory |
| `branding` | — | `{logo, name, link}` for footer |

## HTML structure

The generated page uses a warm parchment aesthetic (`--tl-bg: #faf8f4`, accent `--tl-amber: #8b5e3c`)
matching the abnormalia.com IAM page palette. It is scroll-friendly and print-ready.

Phase colors: `amber` · `sage` · `rust` · `slate` · `dusk` · `umber`

## Vaults

- For Anthropic API: `vault.get(anthropic-keys, api-key)`
- For OpenAI-compatible: any vault holding the bearer token

## License

Apache-2.0

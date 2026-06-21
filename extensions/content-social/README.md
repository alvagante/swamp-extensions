# @alvagante/content-social

Generate platform-shaped social media post drafts for:

- `@alvagante/content-social-facebook`
- `@alvagante/content-social-x`
- `@alvagante/content-social-linkedin`
- `@alvagante/content-social-tiktok`
- `@alvagante/content-social-instagram`

The models share one shape: persona-driven copy, optional provided text,
optional provided media, platform targets, tags/mentions, and media generation
requests for `@alvagante/content-image` or `@alvagante/content-card`.

They do not publish to social networks. They create reusable post artifacts that
agents or workflows can review, edit, and wire into later publishing steps.

## Installation

```sh
swamp extension install @alvagante/content-social
```

## Setup

### Agent-driven or save-only

No key is needed if an agent writes the copy and calls `save`:

```sh
swamp model create "@alvagante/content-social-linkedin" my-linkedin
```

### Endpoint-driven generation

```sh
swamp model create "@alvagante/content-social-linkedin" my-linkedin \
  --global-arg apiKey=<YOUR_ANTHROPIC_API_KEY>
```

For OpenAI-compatible endpoints:

```sh
swamp model create "@alvagante/content-social-x" my-x \
  --global-arg apiFormat=openai-compat \
  --global-arg baseUrl=http://localhost:11434/v1
```

Global arguments:

| Argument                    | Required                  | Default          | Description                                              |
| --------------------------- | ------------------------- | ---------------- | -------------------------------------------------------- |
| `apiFormat`                 | No                        | `anthropic`      | `anthropic` or `openai-compat`                           |
| `apiKey`                    | `generate` with Anthropic | -                | Inference API key, preferably vault-backed               |
| `baseUrl`                   | No                        | Provider default | Override endpoint base URL                               |
| `defaultPersonaDescription` | No                        | -                | Free-text voice directive used when method args omit one |

## Generate

```sh
swamp model method run my-linkedin generate \
  --arg topic="Why Puppet still matters in Kubernetes-heavy estates" \
  --arg brief="Audience: senior platform engineers. Avoid nostalgia." \
  --arg contentKind=text-image \
  --arg persona=alvabot \
  --arg hashtags='["Puppet","DevOps","PlatformEngineering"]'
```

If text is missing, `generate` calls the configured inference endpoint. If text
is provided, the model stores/adapts it and only calls inference when it still
needs a media prompt for a missing visual.

Common arguments:

| Argument             | Values                                      | Default                            |
| -------------------- | ------------------------------------------- | ---------------------------------- |
| `topic`              | Any string                                  | Required unless `text` is provided |
| `brief`              | Extra context                               | -                                  |
| `text`               | Existing post copy                          | Generated when absent              |
| `contentKind`        | `text`, `text-image`, `short`, `cards`      | Platform default                   |
| `persona`            | `neutral`, `alvabot`, `abnormalia`          | `neutral`                          |
| `personaDescription` | Custom voice directive                      | -                                  |
| `hashtags`           | String array                                | `[]`                               |
| `mentions`           | String array                                | `[]`                               |
| `link`               | URL                                         | -                                  |
| `callToAction`       | String                                      | -                                  |
| `includeTags`        | Boolean                                     | `true`                             |
| `mediaAssets`        | Provided media descriptors                  | `[]`                               |
| `mediaMode`          | `auto`, `none`, `provided`, `image`, `card` | Platform default                   |
| `mediaPrompt`        | Prompt for generated visual                 | Generated when needed              |
| `imageStyle`         | `content-image` style preset                | `none`                             |
| `cardStyle`          | `content-card` style preset                 | `vintage-playing-card`             |
| `maxCharacters`      | Positive integer                            | Platform target                    |
| `strictLength`       | Boolean                                     | `false`                            |
| `model`              | Inference model ID                          | `claude-opus-4-8`                  |

Platform default targets are editorial targets, not an API contract. Pass
`maxCharacters` and `strictLength=true` when a workflow needs hard enforcement.

## Save

```sh
swamp model method run my-x save \
  --arg text="Configuration drift is not entropy. It is unreviewed design." \
  --arg contentKind=short \
  --arg persona=alvabot \
  --arg hashtags='["Puppet","DevOps"]'
```

`save` never calls an inference endpoint. It records the copy, metadata, tags,
mentions, provided media, and any media request implied by `contentKind` plus
`mediaMode`.

## Media

Provided media:

```sh
swamp model method run my-instagram save \
  --arg text="The catalog is where promises become graph edges." \
  --arg contentKind=text-image \
  --arg mediaMode=provided \
  --arg mediaAssets='[{"kind":"image","path":"catalog.png","altText":"A Puppet catalog graph"}]'
```

Generated media plan:

```sh
swamp model method run my-instagram save \
  --arg text="One card. One uncomfortable infrastructure truth." \
  --arg contentKind=cards \
  --arg mediaPrompt="Puppet catalog compilation as a collectible technical card" \
  --arg cardStyle=tarot-technical
```

The output `post.mediaRequests` field contains an orchestration-friendly request
such as:

```json
{
  "modelType": "@alvagante/content-card",
  "method": "generate",
  "arguments": {
    "prompt": "Puppet catalog compilation as a collectible technical card",
    "style": "tarot-technical",
    "size": "1024x1536"
  }
}
```

Run that request with a `@alvagante/content-card` or `@alvagante/content-image`
model in the next workflow step, then feed the resulting file path back as
`mediaAssets`.

## Outputs

| Output | Type     | Description                                                                  |
| ------ | -------- | ---------------------------------------------------------------------------- |
| `post` | resource | Structured post metadata, text, tags, media assets, media requests, warnings |
| `copy` | file     | Plain-text final post copy                                                   |

CEL example:

```cel
data.latest("my-linkedin", "post").attributes.text
```

## License

Apache 2.0 - see LICENSE.txt for details.

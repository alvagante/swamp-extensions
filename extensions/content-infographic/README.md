# @alvagante/content-infographic

Generate browser-ready **infographic pages** using the OpenAI Images API.

The model creates a generated image plus an HTML page that keeps the explanatory text reliable. This is deliberate: the image carries the visual composition, while the page shell renders title, details, and key points as normal HTML.

## Installation

```sh
swamp extension install @alvagante/content-infographic
```

## Setup

```sh
swamp model create "@alvagante/content-infographic" my-infographic \
  --global-arg apiKey=<YOUR_OPENAI_API_KEY> \
  --global-arg outputDir=/tmp/ixen-site
```

Prefer vault-backed secrets for `apiKey`.

Global arguments:

| Argument    | Required   | Description                                  |
| ----------- | ---------- | -------------------------------------------- |
| `apiKey`    | `generate` | OpenAI API key; mark/store as sensitive data |
| `outputDir` | No         | Directory to also write image and HTML files |

## Usage

### `generate`

```sh
swamp model method run my-infographic generate \
  --input topic="Puppet catalog compilation" \
  --input title="Puppet Catalog Compilation" \
  --input 'keyPoints:json=["Facts enter","Catalog compiles","Agent applies"]' \
  --input style=technical-diagram \
  --input htmlFilename=puppet-catalog-infographic.html
```

Arguments:

| Argument       | Required | Values                                           | Default                    |
| -------------- | -------- | ------------------------------------------------ | -------------------------- |
| `topic`        | Yes      | Any string                                       | -                          |
| `title`        | No       | Page title                                       | `{topic} Infographic`      |
| `details`      | No       | Context rendered in the HTML shell               | -                          |
| `keyPoints`    | No       | Array of short statements                        | `[]`                       |
| `style`        | No       | `none`, `clean`, `editorial`, `ixen-dark`, `ixen-light`, `technical-diagram`, `cyberpunk-photo`, `educational`, `pencil-bw`, `pencil-color-accents`, `blueprint` | `clean` |
| `orientation`  | No       | `wide`, `portrait`, `square`                     | `wide`                     |
| `model`        | No       | OpenAI image model                               | `gpt-image-2`              |
| `background`   | No       | `opaque`, `transparent`, `auto`                  | `opaque`                   |
| `size`         | No       | OpenAI image size                                | Based on `orientation`     |
| `quality`      | No       | `auto`, `low`, `medium`, `high`                  | `auto`                     |
| `format`       | No       | `png`, `webp`, `jpeg`                            | `png`                      |
| `filename`     | No       | Generated image filename                         | Slug + timestamp           |
| `htmlFilename` | No       | Generated HTML filename                          | `{title}-infographic.html` |
| `outputDir`    | No       | Override global output directory                 | -                          |

### `save`

Store an externally generated image without calling OpenAI:

```sh
swamp model method run my-infographic save \
  --input topic="Puppet catalog compilation" \
  --input title="Puppet Catalog Compilation" \
  --input imageBase64="$(base64 -i catalog.png)" \
  --input htmlFilename=puppet-catalog-infographic.html
```

## Composing with content-ixen

Write the infographic HTML into the same `outputDir` as the Ixen page, then pass the relative path:

```sh
swamp model method run my-ixen generate \
  --input topic="Life as a Puppet compiler" \
  --input infographicPath=puppet-catalog-infographic.html
```

For multiple infographics, pass `infographicPaths` as an array of relative HTML paths.

## Data outputs

| Output        | Type     | Description                                      |
| ------------- | -------- | ------------------------------------------------ |
| `infographic` | resource | Metadata: title, topic, filenames, prompt, model |
| `imageFile`   | file     | Generated image bytes                            |
| `html`        | file     | Self-contained infographic HTML page             |

Access the relative HTML filename via CEL:

```cel
data.latest("my-infographic", "infographic").attributes.htmlFilename
```

## License

Apache 2.0 - see LICENSE.txt for details.

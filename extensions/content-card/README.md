# @alvagante/content-card

Generate **playing-card shaped content images** using the OpenAI Images API.

The model is intentionally close to `@alvagante/content-image`: same API key and output directory pattern, same image-generation controls, plus card-specific fields for sequence number, skill-level corner value, bottom-left icon, optional bottom-right logo hint, and a larger style vocabulary.

## Installation

```sh
swamp extension install @alvagante/content-card
```

## Setup

```sh
swamp model create "@alvagante/content-card" my-card \
  --global-arg apiKey=<YOUR_OPENAI_API_KEY> \
  --global-arg outputDir=/tmp/ixen-site
```

Prefer vault-backed secrets for `apiKey`.

Global arguments:

| Argument    | Required   | Description                                  |
| ----------- | ---------- | -------------------------------------------- |
| `apiKey`    | `generate` | OpenAI API key; mark/store as sensitive data |
| `outputDir` | No         | Directory to also write generated images     |

## Usage

```sh
swamp model method run my-card generate \
  --input prompt="Puppet catalog compilation as a resource graph" \
  --input title="Catalog" \
  --input text="Facts become graph. Graph becomes change." \
  --input cardNumber=7 \
  --input cardCount=12 \
  --input skillLevel=senior \
  --input cornerIcon="directed graph node icon" \
  --input logo="example42 wordmark" \
  --input style=tarot-technical \
  --input filename=puppet-catalog-card.png
```

Arguments:

| Argument     | Required | Values | Default |
| ------------ | -------- | ------ | ------- |
| `prompt`     | Yes      | Image/card topic prompt | - |
| `title`      | No       | Short title to include in the card prompt | - |
| `text`       | No       | Short central text to request in the generated image | Model composes it |
| `cardNumber` | No       | Positive integer printed in the top-left corner | `1` |
| `cardCount`  | No       | Positive integer, validates `cardNumber <= cardCount` | - |
| `skillLevel` | No       | `novice`, `intermediate`, `senior`, `guru` | `intermediate` |
| `cornerIcon` | No       | Bottom-left icon description | Topic-derived icon |
| `logo`       | No       | Bottom-right logo/mark description | Blank corner |
| `style`      | No       | See style presets below | `vintage-playing-card` |
| `model`      | No       | OpenAI image model | `gpt-image-2` |
| `background` | No       | `opaque`, `transparent`, `auto` | `opaque` |
| `size`       | No       | OpenAI image size | `1024x1536` |
| `quality`    | No       | `auto`, `low`, `medium`, `high` | `auto` |
| `format`     | No       | `png`, `webp`, `jpeg` | `png` |
| `filename`   | No       | Generated image filename | Slug + timestamp |
| `outputDir`  | No       | Override global output directory | - |

Common `size` values:

| Size | Use |
| ---- | --- |
| `1024x1536` | Default portrait card |
| `1536x1024` | Landscape card/poster variant |
| `1024x1024` | Square card tile |
| `2048x2048` | 2K square |
| `2160x3840` | 4K portrait |
| `3840x2160` | 4K landscape |
| `auto` | Let the model choose |

## Skill Map

The skill levels match the other `content-*` writing extensions:

| Skill level | Corner value |
| ----------- | ------------ |
| `novice` | `1` |
| `intermediate` | `2` |
| `senior` | `3` |
| `guru` | `4` |

## Style Presets

`content-card` includes the `content-image` presets and adds card-focused styles:

| Preset | Effect |
| ------ | ------ |
| `none` | No style prefix |
| `ixen-dark` | Dark technical card, red accent, high contrast |
| `ixen-light` | Near-white graphite/ink technical card |
| `technical-diagram` | Schematic, white background, restrained blue/grey |
| `cyberpunk-photo` | Cinematic neon card |
| `educational` | Friendly textbook-style card |
| `pencil-bw` | Black-and-white graphite card |
| `pencil-color-accents` | Pencil card with isolated color accents |
| `blueprint` | Deep navy blueprint card |
| `vintage-playing-card` | Engraved classic playing-card aesthetic |
| `tarot-technical` | Technical tarot symbolism |
| `brutalist` | Heavy-grid poster-card |
| `risograph` | Limited-color print texture |
| `field-guide` | Scientific specimen card |
| `monochrome-ink` | Crisp black ink ornament |
| `luminous-minimal` | Quiet editorial card with soft light |

## Notes

The model asks the image generator for exact corner numbers, short text, and logo marks, and stores the intended values in metadata. Exact typography and logo fidelity are still image-model dependent. If exact brand rendering is mandatory, generate a logo-free card and composite the logo downstream.

Transparent background requires `gpt-image-1` or `gpt-image-1.5`; `dall-e-3` and `gpt-image-2` are rejected when `background=transparent`.

## Data outputs

| Output      | Type     | Description |
| ----------- | -------- | ----------- |
| `card`      | resource | Metadata: prompt, corner values, style, filenames, model |
| `imageFile` | file     | Generated content-card image bytes |

Access the generated filename via CEL:

```cel
data.latest("my-card", "card").attributes.filename
```

## License

Apache 2.0 - see LICENSE.txt for details.

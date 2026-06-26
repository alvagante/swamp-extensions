# @alvagante/content-image

Generate images using the OpenAI Images API. Defaults to **gpt-image-2** for current image quality, flexible sizes, and quality control. Part of the `@alvagante` content-media suite.

## Installation

```sh
swamp extension install @alvagante/content-image
```

## Setup

Configure your OpenAI API key (required) and an optional shared output directory:

```sh
swamp model create my-image \
  --type @alvagante/content-image \
  --arg apiKey=sk-... \
  --arg outputDir=/path/to/site
```

Or use a vault secret for the API key:

```yaml
globalArguments:
  apiKey: "{{ vault.my-vault.openai-api-key }}"
  outputDir: "/path/to/site"
```

## Methods

### `generate`

Generate an image from a text prompt.

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `prompt` | string | required | Image description |
| `style` | enum | `none` | Style preset (see below) |
| `model` | string | `gpt-image-2` | OpenAI model ID |
| `background` | enum | `opaque` | `opaque`, `transparent`, or `auto` |
| `size` | string | `1024x1024` | Image dimensions (see model constraints) |
| `quality` | enum | `auto` | `auto`, `low`, `medium`, or `high` |
| `format` | enum | `png` | `png`, `webp`, or `jpeg` |
| `filename` | string | auto | Override the output filename |

**Transparent background** requires `gpt-image-1` or `gpt-image-1.5`. Using `background: transparent` with `dall-e-3` or `gpt-image-2` throws an error.

**Common size values:**

| Size | Use |
|------|-----|
| `1024x1024` | Square default |
| `1536x1024` | Landscape |
| `1024x1536` | Portrait |
| `2048x2048` | 2K square |
| `2048x1152` | 2K landscape |
| `3840x2160` | 4K landscape |
| `2160x3840` | 4K portrait |
| `auto` | Let the model choose |

**Size constraints by model:**
- `gpt-image-2`: any size where both edges are multiples of `16`, max edge is `3840px`, aspect ratio is no more than `3:1`, and total pixels are `655360` to `8294400`
- `gpt-image-1.5`: `1024x1024`, `1024x1536`, `1536x1024`, `auto`
- `dall-e-3`: `1024x1024`, `1792x1024`, `1024x1792`

## Style Presets

Style presets prepend a prompt prefix that shapes the visual aesthetic:

| Preset | Effect | Best with |
|--------|--------|-----------|
| `none` | No prefix — prompt used as-is | any |
| `ixen-dark` | Dark background, red accent, technical cyberpunk aesthetic. Matches the content-ixen CSS palette. | `opaque` |
| `ixen-light` | Pencil sketch with selective colored ink traits (slate blue, terracotta, sage — one or two muted tones). Slightly surrealist but sober and composed, closer to Magritte than Dali. | `transparent` |
| `technical-diagram` | White background, blueprint/schematic style, blue/grey accents | `opaque` |
| `cyberpunk-photo` | Photorealistic, neon, rain-slicked urban, cinematic | `opaque` |
| `educational` | Bright, clean, textbook/infographic style | `opaque` |
| `pencil-bw` | Hand-drawn pencil illustration, technical and artistic. Strict B&W graphite, cross-hatching, precise detail. | `transparent` |
| `pencil-color-accents` | B&W pencil with selective color accents — one or two focal elements pop in vivid color, everything else monochrome. | `transparent` |
| `blueprint` | Engineering/architectural blueprint. Fine white lines on deep navy (#003366). Dimension lines, annotations, orthographic projections. | `opaque` or `transparent` |
| `clean` | Modern clean composition, precise hierarchy, sober accent colors, ample whitespace. | `opaque` |
| `editorial` | Magazine editorial aesthetic, strong composition, refined typography, visual storytelling. | `opaque` |

## Composing with content-ixen

`content-image` and `content-ixen` share the same `outputDir` so the Ixen page can reference generated images by relative path:

```sh
# Generate an image into the shared site directory
swamp model method run my-image generate \
  --arg prompt="A Docker container as a steel shipping container in a neon port" \
  --arg style=ixen-dark \
  --arg size=1536x1024 \
  --arg filename=hero.png

# Reference it in the Ixen page
swamp model method run my-ixen generate \
  --arg topic="Docker containers" \
  --arg media="hero.png"
```

The Ixen page uses `<figure class="zoom"><img src="./hero.png" ...>` with a relative path — both files live in the same `outputDir`.

## Data outputs

| Output | Type | Description |
|--------|------|-------------|
| `image` | resource | Metadata: prompt, style, model, size, filename, outputPath, generatedAt |
| `imageFile` | file | Binary image bytes (PNG, WebP, or JPEG) |

Access the filename via CEL:

```
data.latest("my-image", "image").attributes.filename
```

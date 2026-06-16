# @alvagante/content-music

Generate songs from topics using **Claude** to write lyrics and **1min.ai** (Suno or Lyria) to produce audio. Part of the `@alvagante` content-media suite.

## Installation

```sh
swamp extension install @alvagante/content-music
```

## Setup

You need two API keys: a 1min.ai key (required for audio generation) and an Anthropic key (required for Suno with vocals).

```sh
swamp model create my-music \
  --type @alvagante/content-music \
  --arg apiKey='${{ vault.get(onemin-keys, API_KEY) }}' \
  --arg anthropicApiKey='${{ vault.get(anthropic-keys, API_KEY) }}' \
  --arg outputDir=/path/to/site
```

## Methods

### `generate`

Generate a song from a topic.

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `topic` | string | required | What the song is about (personified — the topic narrates itself) |
| `genre` | string | `pop` | Music genre (e.g. `rock`, `jazz`, `electronic`) |
| `mood` | string | `upbeat` | Emotional tone (e.g. `melancholic`, `epic`, `playful`) |
| `title` | string | auto | Override the song title (Claude suggests one otherwise) |
| `instrumental` | boolean | `false` | Skip lyrics, generate instrumental audio only |
| `model` | enum | `suno-ttapi` | `suno-ttapi` for vocals, `lyria-002` for instrumental |
| `sunoVersion` | enum | `chirp-v4-5` | Suno model version: `chirp-v3-0`, `chirp-v3-5`, `chirp-v4`, `chirp-v4-5` |
| `lyricsOnly` | boolean | `false` | Dry-run: generate and store lyrics without calling the audio API |
| `outputDir` | string | global | Override the output directory for this run |

**Two-stage flow (Suno with vocals):**
1. Claude (`claude-haiku-4-5`) writes lyrics + title + genre tags from your topic
2. 1min.ai Suno API converts lyrics → MP3

**Lyria (instrumental):** skips lyrics generation, sends a music description directly to Lyria → 30s WAV at 48kHz.

## Composing with content-ixen

All three extensions share the same `outputDir`:

```sh
swamp model method run my-music generate \
  --arg topic="Kubernetes pods" \
  --arg genre="synthwave" \
  --arg mood="epic"

swamp model method run my-ixen generate \
  --arg topic="Kubernetes pods" \
  --arg media="kubernetes-pods-abc123.mp3"
```

## Data outputs

| Output | Type | Description |
|--------|------|-------------|
| `song` | resource | Metadata: title, lyrics, genre, mood, model, filename, outputPath, audioUrl, generatedAt |
| `audioFile` | file | Binary audio (MP3 for Suno, WAV for Lyria) |

Access via CEL:

```
data.latest("my-music", "song").attributes.filename
data.latest("my-music", "song").attributes.audioUrl
data.latest("my-music", "song").attributes.lyrics
```

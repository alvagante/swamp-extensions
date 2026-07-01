# @alvagante/content-iam

Generate *I Am* biography minisites — self-narrated, editorial-style HTML pages where a real person, fictional character, or AI persona speaks in first person about their own life.

## What it produces

A single `index.html` per run: fully self-contained, no external dependencies. Inline CSS and JavaScript, all media co-located. Intentionally distinct from `@alvagante/content-ixen`:

| | content-ixen | content-iam |
|---|---|---|
| Voice | Technology speaks | Person speaks |
| Aesthetic | Terminal / monospace | Editorial magazine |
| Layout | Terminal windows, popups | Sticky sidebar, side drawers |
| Sections | Concepts + cheatsheets | Facets + dateline + influence map |
| Palette | Dark terminal / accent red | Warm serif / brown `#8b5e3c` |

## Structure

### Sections

- **Biography** — long-form first-person narration, pull quotes, portrait float
- **Key Works** — scannable grid, no prose
- **Facets** — magazine spreads, each with a zoomable image, study drawer (dense cheatsheet slides + verbose notes), and an optional portrait-card
- **In Their Own Words** — verified historical quotes only
- **AI Voices** — clearly labeled imagined first-person statements
- **Influence Map** — embedded iframe or image (generated separately)
- **Dateline** — embedded epoch-grouped life events timeline (generated separately)
- **Links** — verified external resources, all open in new tab

### Navigation

Sticky sidebar table of contents with scroll-tracking active state. On mobile, collapses to a horizontal strip. "Facet Cards" button in the sidebar opens a 3D-flip card grid popup.

### Study drawers

Each facet has a slide-in side drawer with two orthogonal study panels:
- **Study notes** — dense, cheatsheet-style bullet points (like a student's revision card)
- **Notes** — verbose informative prose about the facet

Neither repeats the main body text. Both are orthogonal to the biographical narrative.

### Audio player

Fixed bottom podcast-style player: play/pause, prev/next, track list, lyrics panel, volume, and progress scrubber. Supports multiple tracks. Accepts tracks directly via `musicTracks` or as a fallback discovery from `iam-soundtrack.json`.

## Methods

### `generate`

Calls an LLM (Claude or any OpenAI-compatible endpoint) to write the page. Optionally fetches Wikipedia for factual grounding.

```yaml
method: generate
arguments:
  subject: "Franz Kafka"
  subjectType: real
  wikipediaTitle: "Franz Kafka"
  sourceMode: both
  facts: |
    Key biographical note: Kafka burned roughly 90% of his own manuscripts.
    His explicit instructions to Max Brod were to destroy everything unpublished.
  persona: confessional
  facets:
    - name: The Trial
      imagePath: concept-1.png
      details: "Focus on the biographical parallel with the broken Felice Bauer engagement"
  portraitPath: portrait.png
  headerContent: |-
    <nav><a href="/">Home</a></nav>
  footerContent: |-
    <p>abnormalia.com</p>
  model: claude-opus-4-8
  outputLength: long
  outputDir: iam/kafka
```

#### Wikipedia grounding (`sourceMode`)

| value | behaviour |
|---|---|
| `wikipedia` | fetch Wikipedia only; ignore `facts` |
| `user` | use `facts` only; skip Wikipedia |
| `both` (default) | fetch Wikipedia + incorporate `facts` |

#### Page shell fragments

| argument | required | description |
|---|---:|---|
| `headerContent` | No | Raw HTML fragment rendered above the I Am masthead |
| `footerContent` | No | Raw HTML fragment rendered after the generated body and embedded influence/dateline sections |

### `save`

Store an externally authored page body without any LLM call. No API key required.

### `prepare`

Rotate an existing generated page into a numbered version subdirectory before a new run.

## Personas

Inherits all personas from `content_shared.ts`:

| persona | voice |
|---|---|
| `neutral` | balanced, observational |
| `gonzo` | Hunter S. Thompson — first-person chaos journalism |
| `academic` | analytical, precise |
| `poetic` | lyrical, imagistic |
| `confessional` | raw, intimate, emotionally unguarded |
| `obituary` | elegiac, retrospective |
| `myth` | mythic self-narrator — speaks as if already legend |
| `raconteur` | smart, funny, self-deprecating irony |

## Workflow integration

Designed to be the `page` step in a larger DAG. Typical workflow job order:

```
prepare → (portrait ∥ facet-images ∥ music) → (dateline ∥ influence-map ∥ cards) → page
```

The extension accepts pre-generated file paths for portrait, dateline, influence map, and per-facet card images — it embeds them into the page without re-generating.

## Card style

Use `@alvagante/content-card` with `style: iam-portrait` to generate facet cards — a portrait-card hybrid with circular portrait thumbnail, subject name in serif, and facet image in the lower two-thirds. Pass the generated card paths via the `cards` argument (matched by index to `facets`).

## Vaults required

- `anthropic-keys` (`api-key`) — when `apiFormat: anthropic`
- Or equivalent vault for OpenAI-compatible endpoints

## Subject types

| type | description |
|---|---|
| `real` | Historical or living person; Wikipedia grounding available; factual accuracy required |
| `fictional` | Fictional or mythological character; canon consistency required |
| `persona` | Constructed alter-ego or AI-native being; full creative latitude |

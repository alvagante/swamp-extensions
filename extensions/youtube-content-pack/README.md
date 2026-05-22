# @alvagante/youtube-content-pack

Generate reusable text assets from a YouTube video transcript without scraping
YouTube captions or downloading media.

The extension is aimed at owned videos and creator workflows. It accepts
metadata plus a transcript as plain text, SRT, VTT, or structured segments, then
writes a normalized transcript and a content pack containing title candidates,
descriptions by tone, tags, chapters, exact transcript quotes, social drafts,
an article draft, and QA findings.

`lookup` can optionally fetch public oEmbed metadata for a YouTube URL. It does
not use the YouTube Data API, mutate YouTube metadata, download videos, or fetch
captions.

## Usage

```bash
swamp model @alvagante/youtube-content-pack/generator method run generateContentPack youtube-pack \
  --input title="Demo Video" \
  --input transcriptText="00:00 Welcome to the demo. 00:45 The main idea is repeatable content repurposing."
```

For timestamped input, prefer SRT, VTT, or structured segments:

```json
{
  "metadata": {
    "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "title": "Example Video",
    "channelTitle": "Example Channel"
  },
  "segments": [
    {
      "startSeconds": 0,
      "endSeconds": 12,
      "text": "Welcome to the episode."
    },
    {
      "startSeconds": 12,
      "endSeconds": 34,
      "text": "Today we turn one video into many reusable publishing assets."
    }
  ],
  "tones": ["neutral", "technical", "promotional"],
  "platforms": ["youtube", "linkedin", "x", "bluesky", "mastodon"],
  "articleStyle": "summary"
}
```

## Methods

- `lookup` extracts a video ID from a URL and optionally fetches oEmbed title
  and channel metadata.
- `normalizeTranscript` converts plain text, SRT, VTT, or structured segments
  into timestamped transcript data.
- `generateContentPack` creates publishing assets from metadata and transcript
  input.
- `audit` checks whether the supplied video package has enough material for a
  useful publishing workflow.

## Boundaries

This extension intentionally avoids caption scraping, media download, clipping,
and automatic publishing. Compose it with dedicated YouTube, analytics, archive,
or social publishing extensions when those operations are needed.

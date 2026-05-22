import { z } from "npm:zod@4";

const ToneSchema = z.enum([
  "neutral",
  "technical",
  "casual",
  "promotional",
  "executive",
]);
const PlatformSchema = z.enum([
  "youtube",
  "linkedin",
  "x",
  "bluesky",
  "mastodon",
  "newsletter",
]);
const ArticleStyleSchema = z.enum([
  "summary",
  "deep-dive",
  "how-to",
  "newsletter",
]);
const TranscriptFormatSchema = z.enum(["plain", "srt", "vtt"]);

const MetadataSchema = z.object({
  videoId: z.string().optional(),
  url: z.string().url().optional(),
  title: z.string().min(1).optional(),
  channelTitle: z.string().min(1).optional(),
  publishedAt: z.string().optional(),
  durationSeconds: z.number().int().nonnegative().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

const TranscriptSegmentInputSchema = z.object({
  startSeconds: z.number().nonnegative().optional(),
  endSeconds: z.number().nonnegative().optional(),
  text: z.string().min(1),
});

const NormalizedSegmentSchema = z.object({
  index: z.number().int().nonnegative(),
  startSeconds: z.number().nonnegative().nullable(),
  endSeconds: z.number().nonnegative().nullable(),
  timestamp: z.string().nullable(),
  text: z.string(),
  wordCount: z.number().int().nonnegative(),
});

const NormalizedTranscriptSchema = z.object({
  sourceFormat: TranscriptFormatSchema,
  segmentCount: z.number().int().nonnegative(),
  wordCount: z.number().int().nonnegative(),
  durationSeconds: z.number().nonnegative().nullable(),
  fullText: z.string(),
  segments: z.array(NormalizedSegmentSchema),
});

const LookupResultSchema = z.object({
  videoId: z.string().nullable(),
  url: z.string().nullable(),
  title: z.string().nullable(),
  channelTitle: z.string().nullable(),
  providerName: z.string().nullable(),
});

const ContentPackSchema = z.object({
  metadata: MetadataSchema,
  transcript: NormalizedTranscriptSchema,
  titleCandidates: z.array(z.string()),
  descriptions: z.array(z.object({
    tone: ToneSchema,
    text: z.string(),
  })),
  tags: z.array(z.string()),
  chapters: z.array(z.object({
    timestamp: z.string().nullable(),
    title: z.string(),
    summary: z.string(),
  })),
  quotes: z.array(z.object({
    timestamp: z.string().nullable(),
    text: z.string(),
  })),
  socialPosts: z.array(z.object({
    platform: PlatformSchema,
    text: z.string(),
  })),
  article: z.object({
    style: ArticleStyleSchema,
    title: z.string(),
    body: z.string(),
  }),
  qaFindings: z.array(z.object({
    severity: z.enum(["info", "warn"]),
    id: z.string(),
    message: z.string(),
  })),
});

type Metadata = z.infer<typeof MetadataSchema>;
type TranscriptSegmentInput = z.infer<typeof TranscriptSegmentInputSchema>;
type NormalizedSegment = z.infer<typeof NormalizedSegmentSchema>;
type NormalizedTranscript = z.infer<typeof NormalizedTranscriptSchema>;
type Tone = z.infer<typeof ToneSchema>;
type Platform = z.infer<typeof PlatformSchema>;
type ArticleStyle = z.infer<typeof ArticleStyleSchema>;
type TranscriptFormat = z.infer<typeof TranscriptFormatSchema>;

type ModelContext = {
  writeResource: (
    specName: "lookup" | "transcript" | "contentPack" | "audit",
    name: string,
    content: unknown,
  ) => Promise<unknown>;
};

const STOP_WORDS = new Set([
  "able",
  "about",
  "after",
  "again",
  "against",
  "all",
  "also",
  "and",
  "any",
  "are",
  "around",
  "because",
  "been",
  "before",
  "being",
  "between",
  "both",
  "but",
  "can",
  "could",
  "does",
  "doing",
  "down",
  "each",
  "for",
  "from",
  "had",
  "has",
  "have",
  "having",
  "here",
  "how",
  "into",
  "its",
  "just",
  "like",
  "may",
  "might",
  "more",
  "most",
  "not",
  "now",
  "off",
  "only",
  "our",
  "out",
  "other",
  "over",
  "own",
  "really",
  "same",
  "should",
  "some",
  "such",
  "than",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "today",
  "too",
  "under",
  "very",
  "video",
  "videos",
  "want",
  "what",
  "when",
  "where",
  "which",
  "while",
  "who",
  "why",
  "with",
  "within",
  "without",
  "would",
  "your",
]);

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function words(value: string): string[] {
  return value.toLowerCase().match(/[a-z0-9][a-z0-9'-]{2,}/g) ?? [];
}

function countWords(value: string): number {
  return words(value).length;
}

function sentenceCase(value: string): string {
  const text = compactText(value);
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

function truncateWords(value: string, limit: number): string {
  const parts = compactText(value).split(" ");
  if (parts.length <= limit) return parts.join(" ");
  return `${parts.slice(0, limit).join(" ")}...`;
}

function timestamp(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined) return null;
  const rounded = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${
      String(secs).padStart(2, "0")
    }`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function parseTimestamp(value: string): number | null {
  const match = value.trim().match(
    /(?:(\d+):)?(\d{1,2}):(\d{2})(?:[,.](\d{1,3}))?/,
  );
  if (!match) return null;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const millis = Number((match[4] ?? "0").padEnd(3, "0"));
  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

function parseVideoId(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.hostname === "youtu.be") return url.pathname.slice(1) || null;
    if (url.searchParams.has("v")) return url.searchParams.get("v");
    const shorts = url.pathname.match(/\/shorts\/([^/?]+)/);
    if (shorts) return shorts[1];
    const embed = url.pathname.match(/\/embed\/([^/?]+)/);
    if (embed) return embed[1];
  } catch {
    if (/^[a-zA-Z0-9_-]{11}$/.test(value)) return value;
  }
  return null;
}

function normalizeSegment(
  segment: TranscriptSegmentInput,
  index: number,
): NormalizedSegment {
  const startSeconds = segment.startSeconds ?? null;
  const endSeconds = segment.endSeconds ?? null;
  const text = compactText(segment.text);
  return {
    index,
    startSeconds,
    endSeconds,
    timestamp: timestamp(startSeconds),
    text,
    wordCount: countWords(text),
  };
}

function parseTimedTranscript(
  transcriptText: string,
  sourceFormat: TranscriptFormat,
): TranscriptSegmentInput[] {
  const blocks = transcriptText.replace(/\r/g, "").split(/\n\n+/);
  const segments: TranscriptSegmentInput[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingIndex === -1) continue;

    const [startRaw, endRaw] = lines[timingIndex].split("-->").map((part) =>
      part.trim()
    );
    const text = compactText(lines.slice(timingIndex + 1).join(" "));
    if (!text) continue;

    segments.push({
      startSeconds: parseTimestamp(startRaw) ?? undefined,
      endSeconds: parseTimestamp(endRaw) ?? undefined,
      text,
    });
  }

  if (segments.length === 0 && sourceFormat === "vtt") {
    return parseTimedTranscript(
      transcriptText.replace(/^WEBVTT.*?\n\n/s, ""),
      "srt",
    );
  }

  return segments;
}

function parsePlainTranscript(
  transcriptText: string,
): TranscriptSegmentInput[] {
  const lines = transcriptText.split(/\n+/).map(compactText).filter(Boolean);
  const source = lines.length > 1 ? lines : compactText(transcriptText).split(
    /(?<=[.!?])\s+/,
  );

  return source.map((line) => {
    const match = line.match(
      /^((?:\d+:)?\d{1,2}:\d{2}(?:[,.]\d{1,3})?)\s+(.+)$/,
    );
    if (!match) return { text: line };
    return {
      startSeconds: parseTimestamp(match[1]) ?? undefined,
      text: match[2],
    };
  }).filter((segment) => compactText(segment.text).length > 0);
}

function normalizeTranscriptInput(args: {
  transcriptText?: string;
  segments?: TranscriptSegmentInput[];
  sourceFormat?: TranscriptFormat;
}): NormalizedTranscript {
  const sourceFormat = args.sourceFormat ?? "plain";
  const rawSegments = args.segments?.length
    ? args.segments
    : sourceFormat === "plain"
    ? parsePlainTranscript(args.transcriptText ?? "")
    : parseTimedTranscript(args.transcriptText ?? "", sourceFormat);
  const segments = rawSegments.map(normalizeSegment).filter((segment) =>
    segment.text.length > 0
  );
  const fullText = segments.map((segment) => segment.text).join(" ");
  const durationSeconds = segments.reduce<number | null>((max, segment) => {
    const value = segment.endSeconds ?? segment.startSeconds;
    if (value === null || value === undefined) return max;
    return max === null ? value : Math.max(max, value);
  }, null);

  return {
    sourceFormat,
    segmentCount: segments.length,
    wordCount: countWords(fullText),
    durationSeconds,
    fullText,
    segments,
  };
}

function keywordCandidates(transcript: NormalizedTranscript, limit: number) {
  const counts = new Map<string, number>();
  for (const word of words(transcript.fullText)) {
    if (STOP_WORDS.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) =>
      right[1] - left[1] || left[0].localeCompare(right[0])
    )
    .slice(0, limit)
    .map(([word]) => word);
}

function titleFromMetadata(metadata: Metadata): string {
  return metadata.title ?? "Untitled YouTube Video";
}

function titleCandidates(metadata: Metadata, tags: string[]): string[] {
  const title = titleFromMetadata(metadata);
  const topic = tags.slice(0, 3).join(", ");
  return [
    title,
    topic ? `${title}: ${sentenceCase(topic)}` : `${title}: Key Takeaways`,
    topic
      ? `What ${title} Teaches About ${sentenceCase(topic)}`
      : `What ${title} Teaches`,
    `Highlights from ${title}`,
  ];
}

function buildChapters(transcript: NormalizedTranscript) {
  const timed = transcript.segments.filter((segment) =>
    segment.startSeconds !== null
  );
  const source = timed.length > 0 ? timed : transcript.segments;
  const chapters = [];
  const stride = Math.max(1, Math.ceil(source.length / 6));

  for (
    let index = 0;
    index < source.length && chapters.length < 8;
    index += stride
  ) {
    const group = source.slice(index, index + stride);
    const text = compactText(group.map((segment) => segment.text).join(" "));
    if (!text) continue;
    chapters.push({
      timestamp: group[0].timestamp,
      title: sentenceCase(truncateWords(text, 7)).replace(/[.,;:!?]+$/, ""),
      summary: truncateWords(text, 28),
    });
  }

  return chapters;
}

function quoteCandidates(transcript: NormalizedTranscript) {
  const sentences = transcript.segments.flatMap((segment) =>
    segment.text.split(/(?<=[.!?])\s+/).map((text) => ({
      timestamp: segment.timestamp,
      text: compactText(text),
    }))
  );

  return sentences
    .filter((sentence) => {
      const count = countWords(sentence.text);
      return count >= 8 && count <= 34;
    })
    .sort((left, right) =>
      countWords(right.text) - countWords(left.text) ||
      left.text.localeCompare(right.text)
    )
    .slice(0, 8);
}

function descriptionForTone(
  metadata: Metadata,
  tone: Tone,
  chapters: ReturnType<typeof buildChapters>,
  tags: string[],
): string {
  const title = titleFromMetadata(metadata);
  const channel = metadata.channelTitle ? ` by ${metadata.channelTitle}` : "";
  const intro = {
    neutral: `${title}${channel} covers ${tags.slice(0, 5).join(", ")}.`,
    technical: `${title}${channel} walks through the core mechanics behind ${
      tags.slice(0, 5).join(", ")
    }.`,
    casual:
      `A quick, useful pass through ${title}${channel}, with the parts worth keeping close.`,
    promotional:
      `${title}${channel} turns a focused idea into practical takeaways you can use immediately.`,
    executive:
      `${title}${channel} summarizes the decisions, tradeoffs, and signals that matter.`,
  }[tone];
  const chapterLines = chapters
    .filter((chapter) => chapter.timestamp)
    .map((chapter) => `${chapter.timestamp} ${chapter.title}`);
  const tagLine = tags.length
    ? `\n\nTopics: ${tags.slice(0, 12).join(", ")}`
    : "";
  const chaptersText = chapterLines.length
    ? `\n\nChapters:\n${chapterLines.join("\n")}`
    : "";
  return `${intro}${chaptersText}${tagLine}`.trim();
}

function socialPost(
  metadata: Metadata,
  platform: Platform,
  tags: string[],
  quotes: ReturnType<typeof quoteCandidates>,
): string {
  const title = titleFromMetadata(metadata);
  const quote = quotes[0]?.text;
  const topic = tags.slice(0, 3).join(", ");
  const url = metadata.url ?? "";
  const base = quote
    ? `${title}\n\n"${quote}"\n\n${topic ? `Topics: ${topic}` : ""}`
    : `${title}\n\n${
      topic ? `Key topics: ${topic}` : "Key takeaways from the video."
    }`;

  if (platform === "x" || platform === "bluesky") {
    return truncateWords(`${title}: ${topic || "key takeaways"} ${url}`, 32);
  }
  if (platform === "mastodon") {
    return `${base}\n\n${url}`.trim();
  }
  if (platform === "newsletter") {
    return `Subject: ${title}\n\n${base}\n\n${url}`.trim();
  }
  if (platform === "youtube") {
    return descriptionForTone(metadata, "neutral", [], tags);
  }
  return `${base}\n\n${url}`.trim();
}

function articleBody(
  metadata: Metadata,
  style: ArticleStyle,
  chapters: ReturnType<typeof buildChapters>,
  quotes: ReturnType<typeof quoteCandidates>,
): string {
  const title = titleFromMetadata(metadata);
  const sections = chapters.length ? chapters : [{
    timestamp: null,
    title: "Overview",
    summary: metadata.description ??
      "The video introduces the main topic and its practical takeaways.",
  }];
  const lead = {
    summary:
      `This article summarizes the main ideas from "${title}" and preserves the useful timestamp anchors for follow-up.`,
    "deep-dive":
      `This deep dive expands the structure of "${title}" into themes, evidence, and practical implications.`,
    "how-to":
      `This guide turns "${title}" into a sequence of practical steps and checkpoints.`,
    newsletter:
      `This edition highlights the strongest ideas from "${title}" and why they matter now.`,
  }[style];
  const sectionText = sections.map((chapter) => {
    const anchor = chapter.timestamp ? ` (${chapter.timestamp})` : "";
    return `## ${chapter.title}${anchor}\n\n${chapter.summary}`;
  }).join("\n\n");
  const quoteText = quotes.length
    ? `\n\n## Notable Quotes\n\n${
      quotes.map((quote) =>
        `- ${quote.timestamp ? `${quote.timestamp} ` : ""}"${quote.text}"`
      ).join("\n")
    }`
    : "";

  return `${lead}\n\n${sectionText}${quoteText}`;
}

function auditFindings(metadata: Metadata, transcript: NormalizedTranscript) {
  const findings = [];
  if (!metadata.title) {
    findings.push({
      severity: "warn" as const,
      id: "missing-title",
      message:
        "No title was supplied; generated assets will use a generic placeholder.",
    });
  }
  if (transcript.wordCount < 200) {
    findings.push({
      severity: "warn" as const,
      id: "short-transcript",
      message:
        "Transcript is short; quotes, chapters, and article sections may be thin.",
    });
  }
  if (!transcript.segments.some((segment) => segment.timestamp)) {
    findings.push({
      severity: "info" as const,
      id: "untimestamped-transcript",
      message:
        "Transcript has no timestamps; chapters and quotes cannot point to video positions.",
    });
  }
  if (!metadata.url && !metadata.videoId) {
    findings.push({
      severity: "info" as const,
      id: "missing-video-reference",
      message: "No YouTube URL or video ID was supplied.",
    });
  }
  return findings;
}

async function fetchOembed(url: string) {
  const response = await fetch(
    `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`,
  );
  if (!response.ok) {
    throw new Error(`YouTube oEmbed lookup failed: HTTP ${response.status}`);
  }
  return await response.json() as {
    title?: string;
    author_name?: string;
    provider_name?: string;
  };
}

/**
 * YouTube content-pack generator for owned or user-supplied video material.
 *
 * The model turns metadata and transcripts into structured publishing assets
 * without scraping captions, downloading media, mutating YouTube state, or
 * depending on an external LLM service.
 */
export const model = {
  type: "@alvagante/youtube-content-pack/generator",
  version: "2026.05.22.1",
  globalArguments: z.object({}),
  resources: {
    lookup: {
      description: "YouTube oEmbed metadata lookup result",
      schema: LookupResultSchema,
      lifetime: "infinite",
      garbageCollection: 20,
    },
    transcript: {
      description: "Normalized transcript with optional timestamped segments",
      schema: NormalizedTranscriptSchema,
      lifetime: "infinite",
      garbageCollection: 20,
    },
    contentPack: {
      description: "Generated publishing assets for a YouTube video",
      schema: ContentPackSchema,
      lifetime: "infinite",
      garbageCollection: 20,
    },
    audit: {
      description: "Readiness findings for content-pack generation",
      schema: z.object({
        metadata: MetadataSchema,
        transcript: NormalizedTranscriptSchema,
        findings: ContentPackSchema.shape.qaFindings,
      }),
      lifetime: "infinite",
      garbageCollection: 20,
    },
  },
  methods: {
    lookup: {
      description:
        "Extract a YouTube video ID and optionally fetch public oEmbed metadata",
      arguments: z.object({
        url: z.string().min(1),
        fetchOembed: z.boolean().default(true),
      }),
      execute: async (
        args: { url: string; fetchOembed?: boolean },
        context: ModelContext,
      ) => {
        const videoId = parseVideoId(args.url);
        const metadata = args.fetchOembed === false
          ? undefined
          : await fetchOembed(args.url);
        const result = {
          videoId,
          url: args.url,
          title: metadata?.title ?? null,
          channelTitle: metadata?.author_name ?? null,
          providerName: metadata?.provider_name ?? null,
        };
        const handle = await context.writeResource(
          "lookup",
          videoId ?? "lookup",
          result,
        );
        return { dataHandles: [handle] };
      },
    },
    normalizeTranscript: {
      description:
        "Normalize plain text, SRT, VTT, or structured transcript segments",
      arguments: z.object({
        transcriptText: z.string().optional(),
        segments: z.array(TranscriptSegmentInputSchema).default([]),
        sourceFormat: TranscriptFormatSchema.default("plain"),
      }),
      execute: async (
        args: {
          transcriptText?: string;
          segments?: TranscriptSegmentInput[];
          sourceFormat?: TranscriptFormat;
        },
        context: ModelContext,
      ) => {
        const transcript = normalizeTranscriptInput(args);
        const handle = await context.writeResource(
          "transcript",
          "transcript",
          transcript,
        );
        return { dataHandles: [handle] };
      },
    },
    generateContentPack: {
      description:
        "Generate descriptions, tags, chapters, exact quotes, social drafts, and an article from transcript input",
      arguments: z.object({
        metadata: MetadataSchema.default({ tags: [] }),
        title: z.string().optional(),
        url: z.string().url().optional(),
        transcriptText: z.string().optional(),
        segments: z.array(TranscriptSegmentInputSchema).default([]),
        sourceFormat: TranscriptFormatSchema.default("plain"),
        tones: z.array(ToneSchema).default(["neutral"]),
        platforms: z.array(PlatformSchema).default([
          "youtube",
          "linkedin",
          "x",
        ]),
        articleStyle: ArticleStyleSchema.default("summary"),
        maxTags: z.number().int().positive().max(30).default(15),
      }),
      execute: async (
        args: {
          metadata?: Metadata;
          title?: string;
          url?: string;
          transcriptText?: string;
          segments?: TranscriptSegmentInput[];
          sourceFormat?: TranscriptFormat;
          tones?: Tone[];
          platforms?: Platform[];
          articleStyle?: ArticleStyle;
          maxTags?: number;
        },
        context: ModelContext,
      ) => {
        const metadata = MetadataSchema.parse({
          ...(args.metadata ?? {}),
          title: args.title ?? args.metadata?.title,
          url: args.url ?? args.metadata?.url,
        });
        const transcript = normalizeTranscriptInput(args);
        const tags = [
          ...new Set([
            ...metadata.tags,
            ...keywordCandidates(transcript, args.maxTags ?? 15),
          ]),
        ].slice(0, args.maxTags ?? 15);
        const chapters = buildChapters(transcript);
        const quotes = quoteCandidates(transcript);
        const tones = args.tones ?? ["neutral"];
        const platforms = args.platforms ?? ["youtube", "linkedin", "x"];
        const articleStyle = args.articleStyle ?? "summary";
        const pack = {
          metadata,
          transcript,
          titleCandidates: titleCandidates(metadata, tags),
          descriptions: tones.map((tone) => ({
            tone,
            text: descriptionForTone(metadata, tone, chapters, tags),
          })),
          tags,
          chapters,
          quotes,
          socialPosts: platforms.map((platform) => ({
            platform,
            text: socialPost(metadata, platform, tags, quotes),
          })),
          article: {
            style: articleStyle,
            title: titleFromMetadata(metadata),
            body: articleBody(metadata, articleStyle, chapters, quotes),
          },
          qaFindings: auditFindings(metadata, transcript),
        };
        const handle = await context.writeResource(
          "contentPack",
          "content-pack",
          pack,
        );
        return { dataHandles: [handle] };
      },
    },
    audit: {
      description:
        "Check whether supplied metadata and transcript are ready for content generation",
      arguments: z.object({
        metadata: MetadataSchema.default({ tags: [] }),
        transcriptText: z.string().optional(),
        segments: z.array(TranscriptSegmentInputSchema).default([]),
        sourceFormat: TranscriptFormatSchema.default("plain"),
      }),
      execute: async (
        args: {
          metadata?: Metadata;
          transcriptText?: string;
          segments?: TranscriptSegmentInput[];
          sourceFormat?: TranscriptFormat;
        },
        context: ModelContext,
      ) => {
        const metadata = MetadataSchema.parse(args.metadata ?? {});
        const transcript = normalizeTranscriptInput(args);
        const result = {
          metadata,
          transcript,
          findings: auditFindings(metadata, transcript),
        };
        const handle = await context.writeResource("audit", "audit", result);
        return { dataHandles: [handle] };
      },
    },
  },
};

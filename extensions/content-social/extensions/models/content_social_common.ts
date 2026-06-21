import { z } from "npm:zod@4";

const ApiFormatSchema = z.enum(["anthropic", "openai-compat"]);
const ContentKindSchema = z.enum(["text", "text-image", "short", "cards"]);
const MediaKindSchema = z.enum(["image", "card", "video", "link"]);
const MediaModeSchema = z.enum(["auto", "none", "provided", "image", "card"]);
const PersonaSchema = z.enum(["neutral", "alvabot", "abnormalia"]);
const ImageStyleSchema = z.enum([
  "none",
  "ixen-dark",
  "ixen-light",
  "technical-diagram",
  "cyberpunk-photo",
  "educational",
  "pencil-bw",
  "pencil-color-accents",
  "blueprint",
]);
const CardStyleSchema = z.enum([
  "none",
  "ixen-dark",
  "ixen-light",
  "technical-diagram",
  "cyberpunk-photo",
  "educational",
  "pencil-bw",
  "pencil-color-accents",
  "blueprint",
  "vintage-playing-card",
  "tarot-technical",
  "brutalist",
  "risograph",
  "field-guide",
  "monochrome-ink",
  "luminous-minimal",
]);

type ApiFormat = z.infer<typeof ApiFormatSchema>;
type ContentKind = z.infer<typeof ContentKindSchema>;
type MediaKind = z.infer<typeof MediaKindSchema>;
type MediaMode = z.infer<typeof MediaModeSchema>;
type Persona = z.infer<typeof PersonaSchema>;
type ImageStyle = z.infer<typeof ImageStyleSchema>;
type CardStyle = z.infer<typeof CardStyleSchema>;

type PlatformConfig = {
  key: "facebook" | "x" | "linkedin" | "tiktok" | "instagram";
  type: string;
  label: string;
  version: string;
  targetCharacters: number;
  shortCharacters: number;
  hashtagTarget: number;
  defaultContentKind: ContentKind;
  defaultMediaMode: MediaMode;
  imageSize: string;
  guidance: string;
};

/** Swamp model definition returned by the shared content-social factory. */
export type SocialModel = {
  type: string;
  version: string;
  globalArguments: unknown;
  resources: Record<string, unknown>;
  files: Record<string, unknown>;
  methods: {
    generate: {
      description: string;
      arguments: unknown;
      execute: (
        args: unknown,
        context: unknown,
      ) => Promise<{ dataHandles: unknown[] }>;
    };
    save: {
      description: string;
      arguments: unknown;
      execute: (
        args: unknown,
        context: unknown,
      ) => Promise<{ dataHandles: unknown[] }>;
    };
  };
};

const MediaAssetSchema = z.object({
  kind: MediaKindSchema,
  url: z.string().url().optional(),
  path: z.string().optional(),
  altText: z.string().optional(),
  description: z.string().optional(),
});

const MediaRequestSchema = z.object({
  modelType: z.enum([
    "@alvagante/content-image",
    "@alvagante/content-card",
  ]),
  method: z.literal("generate"),
  reason: z.string(),
  arguments: z.record(z.string(), z.unknown()),
});

const PostSchema = z.object({
  platform: z.string(),
  text: z.string(),
  shortText: z.string().optional(),
  title: z.string().optional(),
  topic: z.string().optional(),
  brief: z.string().optional(),
  contentKind: ContentKindSchema,
  persona: PersonaSchema,
  personaDescription: z.string().optional(),
  hashtags: z.array(z.string()),
  mentions: z.array(z.string()),
  link: z.string().url().optional(),
  callToAction: z.string().optional(),
  mediaAssets: z.array(MediaAssetSchema),
  mediaRequests: z.array(MediaRequestSchema),
  characterCount: z.number().int().nonnegative(),
  targetCharacters: z.number().int().positive(),
  warnings: z.array(z.string()),
  model: z.string(),
  generatedAt: z.string(),
});

type MediaAsset = z.infer<typeof MediaAssetSchema>;
type MediaRequest = z.infer<typeof MediaRequestSchema>;
type SocialPost = z.infer<typeof PostSchema>;

type ModelContext = {
  globalArgs: {
    apiFormat: ApiFormat;
    apiKey?: string;
    baseUrl?: string;
    defaultPersonaDescription?: string;
  };
  writeResource: (
    specName: "post",
    name: string,
    content: unknown,
  ) => Promise<unknown>;
  createFileWriter: (
    specName: "copy",
    name: string,
  ) => {
    writeText: (text: string) => Promise<unknown>;
  };
  logger: {
    info: (msg: string, props?: Record<string, unknown>) => void;
    error: (msg: string, props?: Record<string, unknown>) => void;
  };
};

type GenerateArgs = {
  topic?: string;
  brief?: string;
  text?: string;
  contentKind: ContentKind;
  persona: Persona;
  personaDescription?: string;
  hashtags: string[];
  mentions: string[];
  link?: string;
  callToAction?: string;
  includeTags: boolean;
  mediaAssets: MediaAsset[];
  mediaMode: MediaMode;
  mediaPrompt?: string;
  cardTitle?: string;
  cardText?: string;
  cardStyle: CardStyle;
  imageStyle: ImageStyle;
  maxCharacters?: number;
  strictLength: boolean;
  model: string;
};

type SaveArgs = Omit<GenerateArgs, "text" | "model"> & {
  text: string;
  title?: string;
  shortText?: string;
  model: string;
};

type GeneratedDraft = {
  title?: string;
  text: string;
  shortText?: string;
  hashtags: string[];
  mentions: string[];
  mediaPrompt?: string;
  altText?: string;
};

const DEFAULT_BASE_URL: Record<ApiFormat, string> = {
  "anthropic": "https://api.anthropic.com",
  "openai-compat": "http://localhost:11434/v1",
};

const PERSONA_DIRECTIVES: Record<Persona, string> = {
  neutral:
    "Voice: clear, direct, platform-native, with no visible imitation of a named person.",
  alvabot:
    "Voice: Alessandro Franceschi / example42. Pragmatic, technically deep, conversational, occasionally self-ironic. Direct about tradeoffs and allergic to corporate filler.",
  abnormalia:
    "Voice: cyberpunk-inflected technical culture. Sharp, unsentimental, visually specific, dense when needed, no bland platform sludge.",
};

/** Platform-specific defaults for the five content-social model entrypoints. */
export const PLATFORM_CONFIGS: Record<PlatformConfig["key"], PlatformConfig> = {
  facebook: {
    key: "facebook",
    type: "@alvagante/content-social-facebook",
    label: "Facebook",
    version: "2026.06.21.1",
    targetCharacters: 800,
    shortCharacters: 180,
    hashtagTarget: 4,
    defaultContentKind: "text-image",
    defaultMediaMode: "image",
    imageSize: "1024x1024",
    guidance:
      "Write for a broad feed. Prefer an accessible hook, one concrete idea, and an easy conversational CTA. Hashtags should be sparse.",
  },
  x: {
    key: "x",
    type: "@alvagante/content-social-x",
    label: "X",
    version: "2026.06.21.1",
    targetCharacters: 280,
    shortCharacters: 220,
    hashtagTarget: 2,
    defaultContentKind: "short",
    defaultMediaMode: "none",
    imageSize: "1024x1024",
    guidance:
      "Write compactly. Lead with the point, keep one sharp turn, and avoid thread-like setup unless the user explicitly asks for it.",
  },
  linkedin: {
    key: "linkedin",
    type: "@alvagante/content-social-linkedin",
    label: "LinkedIn",
    version: "2026.06.21.1",
    targetCharacters: 1300,
    shortCharacters: 300,
    hashtagTarget: 5,
    defaultContentKind: "text-image",
    defaultMediaMode: "image",
    imageSize: "1024x1024",
    guidance:
      "Write for professional readers. Use a strong first line, useful operational substance, and a non-cringe discussion prompt.",
  },
  tiktok: {
    key: "tiktok",
    type: "@alvagante/content-social-tiktok",
    label: "TikTok",
    version: "2026.06.21.1",
    targetCharacters: 300,
    shortCharacters: 150,
    hashtagTarget: 6,
    defaultContentKind: "short",
    defaultMediaMode: "image",
    imageSize: "1024x1792",
    guidance:
      "Write as a short caption or video hook. Make the first words do real work. Suggest visual energy without pretending to create video.",
  },
  instagram: {
    key: "instagram",
    type: "@alvagante/content-social-instagram",
    label: "Instagram",
    version: "2026.06.21.1",
    targetCharacters: 2200,
    shortCharacters: 150,
    hashtagTarget: 12,
    defaultContentKind: "text-image",
    defaultMediaMode: "image",
    imageSize: "1024x1024",
    guidance:
      "Write for image-first consumption. Pair a human hook with compact substance. Hashtags can be richer, but still curated.",
  },
};

function resolveBaseUrl(apiFormat: ApiFormat, baseUrl?: string): string {
  return (baseUrl ?? DEFAULT_BASE_URL[apiFormat]).replace(/\/$/, "");
}

function supportsAdaptiveThinking(modelId: string): boolean {
  return (
    modelId.includes("opus-4") ||
    modelId.includes("fable") ||
    modelId.includes("mythos")
  );
}

function buildRequest(
  apiFormat: ApiFormat,
  apiKey: string | undefined,
  baseUrl: string,
  modelId: string,
  systemPrompt: string,
  userMessage: string,
): {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
} {
  if (apiFormat === "anthropic") {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
    };
    if (apiKey) headers["x-api-key"] = apiKey;
    const body: Record<string, unknown> = {
      model: modelId,
      max_tokens: 1800,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    };
    if (supportsAdaptiveThinking(modelId)) {
      body.thinking = { type: "adaptive" };
    }
    return { url: `${baseUrl}/v1/messages`, headers, body };
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (apiKey) headers["authorization"] = `Bearer ${apiKey}`;
  return {
    url: `${baseUrl}/chat/completions`,
    headers,
    body: {
      model: modelId,
      max_tokens: 1800,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    },
  };
}

function extractContent(
  apiFormat: ApiFormat,
  responseJson: unknown,
): { text: string; stopReason: string } {
  if (apiFormat === "anthropic") {
    const result = responseJson as {
      content: Array<{ type: string; text?: string }>;
      stop_reason: string;
    };
    const text = result.content
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("\n")
      .trim();
    return { text, stopReason: result.stop_reason };
  }

  const result = responseJson as {
    choices: Array<{ message: { content: string }; finish_reason: string }>;
  };
  const choice = result.choices[0];
  return {
    text: choice?.message?.content?.trim() ?? "",
    stopReason: choice?.finish_reason ?? "unknown",
  };
}

function buildSystemPrompt(
  config: PlatformConfig,
  persona: Persona,
  personaDescription?: string,
): string {
  const voice = personaDescription?.trim() ||
    PERSONA_DIRECTIVES[persona];
  return `You write social media copy for ${config.label}.

${config.guidance}

${voice}

Return only one JSON object, with no Markdown fences and no commentary.
Schema:
{
  "title": "optional internal title",
  "text": "final post copy",
  "shortText": "optional shorter variant",
  "hashtags": ["without # or with #, both accepted"],
  "mentions": ["without @ or with @, both accepted"],
  "mediaPrompt": "optional image/card generation prompt",
  "altText": "optional accessible media description"
}`;
}

function buildUserMessage(config: PlatformConfig, args: GenerateArgs): string {
  const target = args.maxCharacters ??
    (args.contentKind === "short"
      ? config.shortCharacters
      : config.targetCharacters);
  const parts = [
    `Platform: ${config.label}`,
    `Content kind: ${args.contentKind}`,
    `Target characters: ${target}`,
    `Hashtag target: ${config.hashtagTarget}`,
  ];
  if (args.topic) parts.push(`Topic: ${args.topic}`);
  if (args.brief) parts.push(`Brief/context:\n${args.brief}`);
  if (args.text) {
    parts.push(`Existing text to adapt, preserve, or tighten:\n${args.text}`);
  }
  if (args.link) parts.push(`Link to include or reference: ${args.link}`);
  if (args.callToAction) parts.push(`Call to action: ${args.callToAction}`);
  if (args.hashtags.length > 0) {
    parts.push(`Requested hashtags: ${args.hashtags.join(" ")}`);
  }
  if (args.mentions.length > 0) {
    parts.push(`Requested mentions: ${args.mentions.join(" ")}`);
  }
  if (args.mediaPrompt) {
    parts.push(`Requested media prompt: ${args.mediaPrompt}`);
  } else if (
    args.contentKind === "text-image" || args.contentKind === "cards"
  ) {
    parts.push("Create a mediaPrompt suitable for the visual asset.");
  }
  return parts.join("\n\n");
}

function parseGeneratedDraft(raw: string): GeneratedDraft {
  const jsonText = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(jsonText) as Partial<GeneratedDraft>;
    return {
      title: stringOrUndefined(parsed.title),
      text: String(parsed.text ?? "").trim(),
      shortText: stringOrUndefined(parsed.shortText),
      hashtags: stringArray(parsed.hashtags),
      mentions: stringArray(parsed.mentions),
      mediaPrompt: stringOrUndefined(parsed.mediaPrompt),
      altText: stringOrUndefined(parsed.altText),
    };
  } catch {
    return {
      text: raw.trim(),
      hashtags: [],
      mentions: [],
    };
  }
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

async function generateDraft(
  config: PlatformConfig,
  args: GenerateArgs,
  context: ModelContext,
): Promise<GeneratedDraft> {
  const { apiFormat, apiKey, baseUrl: rawBaseUrl } = context.globalArgs;
  if (apiFormat === "anthropic" && !apiKey) {
    throw new Error("apiKey is required when apiFormat is 'anthropic'");
  }

  const baseUrl = resolveBaseUrl(apiFormat, rawBaseUrl);
  const { url, headers, body } = buildRequest(
    apiFormat,
    apiKey,
    baseUrl,
    args.model,
    buildSystemPrompt(config, args.persona, args.personaDescription),
    buildUserMessage(config, args),
  );

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Inference API error ${response.status} from ${url}: ${errorBody}`,
    );
  }

  const responseJson = await response.json();
  const { text, stopReason } = extractContent(apiFormat, responseJson);
  if (!text) {
    throw new Error(
      `No text content in API response (stop_reason: ${stopReason})`,
    );
  }
  const draft = parseGeneratedDraft(text);
  if (!draft.text) {
    throw new Error("Inference API response did not contain post text");
  }
  return draft;
}

function normalizeHashtag(tag: string): string {
  const cleaned = tag.trim().replace(/^#+/, "").replace(/\s+/g, "");
  return cleaned ? `#${cleaned}` : "";
}

function normalizeMention(mention: string): string {
  const cleaned = mention.trim().replace(/^@+/, "").replace(/\s+/g, "");
  return cleaned ? `@${cleaned}` : "";
}

function uniqueNormalized(
  values: string[],
  normalize: (value: string) => string,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalize(value);
    const key = normalized.toLowerCase();
    if (normalized && !seen.has(key)) {
      seen.add(key);
      result.push(normalized);
    }
  }
  return result;
}

function appendTags(
  text: string,
  mentions: string[],
  hashtags: string[],
  includeTags: boolean,
): string {
  if (!includeTags) return text.trim();
  const missingMentions = mentions.filter((mention) => !text.includes(mention));
  const missingHashtags = hashtags.filter((tag) =>
    !text.toLowerCase().includes(tag.toLowerCase())
  );
  const suffix = [...missingMentions, ...missingHashtags].join(" ").trim();
  return suffix ? `${text.trim()}\n\n${suffix}` : text.trim();
}

function selectMediaKind(
  contentKind: ContentKind,
  mediaMode: MediaMode,
  mediaAssets: MediaAsset[],
): "none" | "image" | "card" {
  if (mediaMode === "none" || mediaMode === "provided") return "none";
  if (mediaAssets.length > 0) return "none";
  if (mediaMode === "image" || mediaMode === "card") return mediaMode;
  if (contentKind === "text-image") return "image";
  if (contentKind === "cards") return "card";
  return "none";
}

function buildMediaRequests(
  config: PlatformConfig,
  args: GenerateArgs | SaveArgs,
  draft: Pick<
    GeneratedDraft,
    "title" | "shortText" | "mediaPrompt" | "altText"
  >,
): MediaRequest[] {
  const kind = selectMediaKind(
    args.contentKind,
    args.mediaMode,
    args.mediaAssets,
  );
  if (kind === "none") return [];

  const prompt = args.mediaPrompt || draft.mediaPrompt ||
    `Social media visual for ${config.label}: ${
      args.topic ?? draft.title ?? args.text
    }`;
  if (kind === "card") {
    return [{
      modelType: "@alvagante/content-card",
      method: "generate",
      reason: `Create a card visual for the ${config.label} post.`,
      arguments: {
        prompt,
        title: args.cardTitle ?? draft.title ?? args.topic,
        text: args.cardText ?? draft.shortText,
        cardNumber: 1,
        cardCount: args.contentKind === "cards" ? 1 : undefined,
        skillLevel: "intermediate",
        style: args.cardStyle,
        size: "1024x1536",
      },
    }];
  }

  return [{
    modelType: "@alvagante/content-image",
    method: "generate",
    reason: `Create an image visual for the ${config.label} post.`,
    arguments: {
      prompt,
      style: args.imageStyle,
      size: config.imageSize,
      background: "opaque",
      format: "png",
    },
  }];
}

function buildWarnings(
  text: string,
  targetCharacters: number,
  mediaRequests: MediaRequest[],
  mediaAssets: MediaAsset[],
  contentKind: ContentKind,
): string[] {
  const warnings: string[] = [];
  if (text.length > targetCharacters) {
    warnings.push(
      `Post is ${text.length} characters, above target ${targetCharacters}.`,
    );
  }
  if (
    (contentKind === "text-image" || contentKind === "cards") &&
    mediaAssets.length === 0 && mediaRequests.length === 0
  ) {
    warnings.push(
      "Post expects media but no media asset or media request exists.",
    );
  }
  return warnings;
}

async function storePost(
  context: ModelContext,
  post: SocialPost,
): Promise<{ dataHandles: unknown[] }> {
  const postHandle = await context.writeResource("post", "post", post);
  const writer = context.createFileWriter("copy", "copy");
  const fileHandle = await writer.writeText(post.text);
  context.logger.info("Social post stored for {platform}", {
    platform: post.platform,
    characterCount: post.characterCount,
  });
  return { dataHandles: [postHandle, fileHandle] };
}

function resolvePersonaDescription(
  argsPersonaDescription: string | undefined,
  context: ModelContext,
): string | undefined {
  return argsPersonaDescription ?? context.globalArgs.defaultPersonaDescription;
}

function mergeDraft(
  config: PlatformConfig,
  args: GenerateArgs,
  draft: GeneratedDraft | undefined,
): Omit<SocialPost, "generatedAt"> {
  const textSource = args.text?.trim() ||
    (args.contentKind === "short"
      ? draft?.shortText || draft?.text
      : draft?.text) ||
    "";
  if (!textSource) {
    throw new Error("Either text or generated post text is required");
  }

  const hashtags = uniqueNormalized(
    [...args.hashtags, ...(draft?.hashtags ?? [])].slice(
      0,
      Math.max(config.hashtagTarget, args.hashtags.length),
    ),
    normalizeHashtag,
  );
  const mentions = uniqueNormalized(
    [...(draft?.mentions ?? []), ...args.mentions],
    normalizeMention,
  );
  const text = appendTags(textSource, mentions, hashtags, args.includeTags);
  const targetCharacters = args.maxCharacters ??
    (args.contentKind === "short"
      ? config.shortCharacters
      : config.targetCharacters);
  const mediaRequests = buildMediaRequests(config, args, {
    title: draft?.title,
    shortText: draft?.shortText,
    mediaPrompt: draft?.mediaPrompt,
    altText: draft?.altText,
  });
  const warnings = buildWarnings(
    text,
    targetCharacters,
    mediaRequests,
    args.mediaAssets,
    args.contentKind,
  );
  if (args.strictLength && text.length > targetCharacters) {
    throw new Error(
      `${config.label} post is ${text.length} characters, above strict target ${targetCharacters}`,
    );
  }

  return {
    platform: config.label,
    text,
    shortText: draft?.shortText,
    title: draft?.title,
    topic: args.topic,
    brief: args.brief,
    contentKind: args.contentKind,
    persona: args.persona,
    personaDescription: args.personaDescription,
    hashtags,
    mentions,
    link: args.link,
    callToAction: args.callToAction,
    mediaAssets: args.mediaAssets,
    mediaRequests,
    characterCount: text.length,
    targetCharacters,
    warnings,
    model: args.text ? "provided" : args.model,
  };
}

function mergeSaved(
  config: PlatformConfig,
  args: SaveArgs,
): Omit<SocialPost, "generatedAt"> {
  const hashtags = uniqueNormalized(args.hashtags, normalizeHashtag);
  const mentions = uniqueNormalized(args.mentions, normalizeMention);
  const text = appendTags(args.text, mentions, hashtags, args.includeTags);
  const targetCharacters = args.maxCharacters ??
    (args.contentKind === "short"
      ? config.shortCharacters
      : config.targetCharacters);
  const mediaRequests = buildMediaRequests(config, args, {
    title: args.title,
    shortText: args.shortText,
    mediaPrompt: args.mediaPrompt,
  });
  const warnings = buildWarnings(
    text,
    targetCharacters,
    mediaRequests,
    args.mediaAssets,
    args.contentKind,
  );
  if (args.strictLength && text.length > targetCharacters) {
    throw new Error(
      `${config.label} post is ${text.length} characters, above strict target ${targetCharacters}`,
    );
  }

  return {
    platform: config.label,
    text,
    shortText: args.shortText,
    title: args.title,
    topic: args.topic,
    brief: args.brief,
    contentKind: args.contentKind,
    persona: args.persona,
    personaDescription: args.personaDescription,
    hashtags,
    mentions,
    link: args.link,
    callToAction: args.callToAction,
    mediaAssets: args.mediaAssets,
    mediaRequests,
    characterCount: text.length,
    targetCharacters,
    warnings,
    model: args.model,
  };
}

/** Create a platform-specific social post generator model definition. */
export function createSocialModel(config: PlatformConfig): SocialModel {
  return {
    type: config.type,
    version: config.version,
    globalArguments: z.object({
      apiFormat: ApiFormatSchema.default("anthropic"),
      apiKey: z.string().optional().meta({ sensitive: true }),
      baseUrl: z.string().optional(),
      defaultPersonaDescription: z.string().optional(),
    }),
    resources: {
      post: {
        description:
          `Generated ${config.label} social post metadata, copy, media assets, and media generation requests`,
        schema: PostSchema,
        lifetime: "infinite",
        garbageCollection: 20,
      },
    },
    files: {
      copy: {
        description: `Generated ${config.label} post copy as plain text`,
        contentType: "text/plain",
        lifetime: "infinite",
        garbageCollection: 20,
      },
    },
    methods: {
      generate: {
        description:
          `Generate or adapt ${config.label} social post copy using a configured LLM endpoint`,
        arguments: z.object({
          topic: z.string().min(1).optional(),
          brief: z.string().optional(),
          text: z.string().min(1).optional(),
          contentKind: ContentKindSchema.default(config.defaultContentKind),
          persona: PersonaSchema.default("neutral"),
          personaDescription: z.string().min(1).optional(),
          hashtags: z.array(z.string()).default([]),
          mentions: z.array(z.string()).default([]),
          link: z.string().url().optional(),
          callToAction: z.string().optional(),
          includeTags: z.boolean().default(true),
          mediaAssets: z.array(MediaAssetSchema).default([]),
          mediaMode: MediaModeSchema.default(config.defaultMediaMode),
          mediaPrompt: z.string().min(1).optional(),
          cardTitle: z.string().min(1).optional(),
          cardText: z.string().min(1).optional(),
          cardStyle: CardStyleSchema.default("vintage-playing-card"),
          imageStyle: ImageStyleSchema.default("none"),
          maxCharacters: z.number().int().positive().optional(),
          strictLength: z.boolean().default(false),
          model: z.string().default("claude-opus-4-8"),
        }),
        execute: async (rawArgs: GenerateArgs, context: ModelContext) => {
          const args = {
            ...rawArgs,
            personaDescription: resolvePersonaDescription(
              rawArgs.personaDescription,
              context,
            ),
          };
          if (!args.topic && !args.text) {
            throw new Error("Either topic or text is required");
          }

          context.logger.info("Generating {platform} social post", {
            platform: config.label,
            contentKind: args.contentKind,
            persona: args.persona,
          });

          const needsDraft = !args.text ||
            ((args.contentKind === "text-image" ||
              args.contentKind === "cards") &&
              !args.mediaPrompt && args.mediaAssets.length === 0);
          const draft = needsDraft
            ? await generateDraft(config, args, context)
            : undefined;
          const post = mergeDraft(config, args, draft);
          return await storePost(context, {
            ...post,
            generatedAt: new Date().toISOString(),
          });
        },
      },
      save: {
        description:
          `Store externally written ${config.label} social post copy without making an inference call`,
        arguments: z.object({
          text: z.string().min(1),
          title: z.string().min(1).optional(),
          shortText: z.string().min(1).optional(),
          topic: z.string().min(1).optional(),
          brief: z.string().optional(),
          contentKind: ContentKindSchema.default(config.defaultContentKind),
          persona: PersonaSchema.default("neutral"),
          personaDescription: z.string().min(1).optional(),
          hashtags: z.array(z.string()).default([]),
          mentions: z.array(z.string()).default([]),
          link: z.string().url().optional(),
          callToAction: z.string().optional(),
          includeTags: z.boolean().default(true),
          mediaAssets: z.array(MediaAssetSchema).default([]),
          mediaMode: MediaModeSchema.default(config.defaultMediaMode),
          mediaPrompt: z.string().min(1).optional(),
          cardTitle: z.string().min(1).optional(),
          cardText: z.string().min(1).optional(),
          cardStyle: CardStyleSchema.default("vintage-playing-card"),
          imageStyle: ImageStyleSchema.default("none"),
          maxCharacters: z.number().int().positive().optional(),
          strictLength: z.boolean().default(false),
          model: z.string().default("external"),
        }),
        execute: async (rawArgs: SaveArgs, context: ModelContext) => {
          const args = {
            ...rawArgs,
            personaDescription: resolvePersonaDescription(
              rawArgs.personaDescription,
              context,
            ),
          };

          context.logger.info("Saving externally generated {platform} post", {
            platform: config.label,
            contentKind: args.contentKind,
          });

          const post = mergeSaved(config, args);
          return await storePost(context, {
            ...post,
            generatedAt: new Date().toISOString(),
          });
        },
      },
    },
  } as SocialModel;
}

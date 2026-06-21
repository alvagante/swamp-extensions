import { z } from "npm:zod@4";

const BackgroundSchema = z.enum(["opaque", "transparent", "auto"]);
const OutputFormatSchema = z.enum(["png", "webp", "jpeg"]);
const QualitySchema = z.enum(["auto", "low", "medium", "high"]);
const SkillLevelSchema = z.enum(["novice", "intermediate", "senior", "guru"]);
const StylePresetSchema = z.enum([
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

type Background = z.infer<typeof BackgroundSchema>;
type OutputFormat = z.infer<typeof OutputFormatSchema>;
type Quality = z.infer<typeof QualitySchema>;
type SkillLevel = z.infer<typeof SkillLevelSchema>;
type StylePreset = z.infer<typeof StylePresetSchema>;

const CardSchema = z.object({
  prompt: z.string(),
  augmentedPrompt: z.string(),
  revisedPrompt: z.string().optional(),
  title: z.string().optional(),
  text: z.string().optional(),
  cardNumber: z.number().int().positive(),
  cardCount: z.number().int().positive().optional(),
  skillLevel: SkillLevelSchema,
  skillValue: z.number().int().min(1).max(4),
  cornerIcon: z.string().optional(),
  logo: z.string().optional(),
  model: z.string(),
  style: StylePresetSchema,
  background: BackgroundSchema,
  size: z.string(),
  quality: QualitySchema,
  format: OutputFormatSchema,
  filename: z.string(),
  outputPath: z.string().optional(),
  generatedAt: z.string(),
});

type CardMetadata = z.infer<typeof CardSchema>;

type ModelContext = {
  globalArgs: {
    apiKey?: string;
    outputDir?: string;
  };
  writeResource: (
    specName: "card",
    name: string,
    content: unknown,
  ) => Promise<unknown>;
  createFileWriter: (
    specName: "imageFile",
    name: string,
    overrides?: { contentType?: string },
  ) => {
    writeAll: (bytes: Uint8Array) => Promise<unknown>;
  };
  logger: {
    info: (msg: string, props?: Record<string, unknown>) => void;
    error: (msg: string, props?: Record<string, unknown>) => void;
  };
};

const SKILL_LEVEL_VALUES: Record<SkillLevel, number> = {
  novice: 1,
  intermediate: 2,
  senior: 3,
  guru: 4,
};

const MIME_TYPES: Record<OutputFormat, string> = {
  png: "image/png",
  webp: "image/webp",
  jpeg: "image/jpeg",
};

const NO_TRANSPARENCY_MODELS = new Set(["dall-e-3", "gpt-image-2"]);
const MAX_API_ATTEMPTS = 3;

const STYLE_PREFIXES: Record<StylePreset, string> = {
  none: "",
  "ixen-dark":
    "Dark near-black playing-card design, red accent (#cc0000), sharp technical cyberpunk aesthetic, high contrast, restrained neon details. ",
  "ixen-light":
    "Near-white paper card, graphite linework, selective muted ink accents, slightly surreal but sober technical composition. ",
  "technical-diagram":
    "Clean technical diagram card, white background, schematic visual hierarchy, precise labels, blue and grey accents. ",
  "cyberpunk-photo":
    "Photorealistic cinematic cyberpunk card, neon-lit materials, rain-polished surfaces, rich atmospheric detail. ",
  educational:
    "Bright educational card, accessible colors, clear hierarchy, friendly textbook illustration style. ",
  "pencil-bw":
    "Black-and-white pencil playing card, fine graphite lines, cross-hatching, precise technical draftsmanship. ",
  "pencil-color-accents":
    "Pencil playing card with one or two vivid color accents, mostly monochrome graphite, focused emphasis. ",
  blueprint:
    "Blueprint playing card, fine white linework on deep navy (#003366), dimension marks, section cuts, schematic precision. ",
  "vintage-playing-card":
    "Classic playing-card illustration, engraved borders, balanced symmetry, aged paper texture, elegant readable ornament. ",
  "tarot-technical":
    "Technical tarot card, symbolic engineering iconography, centered square plate, mystical structure but precise factual tone. ",
  brutalist:
    "Brutalist poster-card, strong grid, heavy black rules, austere typography, minimal palette, high-density information. ",
  risograph:
    "Risograph print card, visible ink texture, limited spot colors, slight registration imperfections, warm paper stock. ",
  "field-guide":
    "Scientific field-guide card, specimen plate, fine annotations, naturalist layout, quiet archival palette. ",
  "monochrome-ink":
    "Monochrome ink card, crisp black line art on white, ornamental frame, dense but legible hatching. ",
  "luminous-minimal":
    "Minimal luminous card, soft light, calm negative space, polished editorial composition, restrained accent color. ",
};

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "content-card";
}

function buildFilename(prompt: string, format: OutputFormat): string {
  return `${slugify(prompt.split(" ").slice(0, 8).join(" "))}-${
    Date.now().toString(36)
  }.${format}`;
}

function buildCardPrompt(params: {
  prompt: string;
  title?: string;
  text?: string;
  cardNumber: number;
  cardCount?: number;
  skillLevel: SkillLevel;
  cornerIcon?: string;
  logo?: string;
  style: StylePreset;
}): string {
  const skillValue = SKILL_LEVEL_VALUES[params.skillLevel];
  const title = params.title ? `Card title: "${params.title}". ` : "";
  const bodyText = params.text
    ? `Use this exact central text if possible: "${params.text}". `
    : "Write one or two short central lines: essential, informative, and slightly evocative. ";
  const cardCount = params.cardCount
    ? `This is card ${params.cardNumber} of ${params.cardCount}; print only "${params.cardNumber}" in the top-left corner. `
    : `Print "${params.cardNumber}" in the top-left corner. `;
  const icon = params.cornerIcon
    ? `Bottom-left corner icon: ${params.cornerIcon}. `
    : "Bottom-left corner: a small icon clearly related to the topic. ";
  const logo = params.logo
    ? `Bottom-right corner logo or mark: ${params.logo}. `
    : "Bottom-right corner remains clean, with no invented logo. ";

  return `${
    STYLE_PREFIXES[params.style]
  }Create a portrait image shaped like a single playing card, aspect ratio about 2.5:3.5, full card visible with rounded corners and a deliberate border. ${cardCount}Print "${skillValue}" in the top-right corner for skill level ${params.skillLevel}. ${icon}${logo}Place a square illustration panel centered in the upper third of the card, visually explaining: ${params.prompt}. ${title}${bodyText}The central text must be useful, compact, and readable. The card should feel like a finished collectible knowledge card, not a poster or web page.`;
}

function buildRequestBody(params: {
  model: string;
  prompt: string;
  size: string;
  background: Background;
  format: OutputFormat;
  quality: Quality;
}): Record<string, unknown> {
  if (params.model === "dall-e-3") {
    return {
      model: params.model,
      prompt: params.prompt,
      n: 1,
      size: params.size === "auto" ? "1024x1792" : params.size,
      quality: params.quality === "high" ? "hd" : "standard",
      response_format: "b64_json",
    };
  }

  const body: Record<string, unknown> = {
    model: params.model,
    prompt: params.prompt,
    n: 1,
    size: params.size,
    output_format: params.format,
    quality: params.quality,
  };
  if (!NO_TRANSPARENCY_MODELS.has(params.model)) {
    body.background = params.background;
  }
  return body;
}

async function callImagesApi(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<{ b64Json: string; revisedPrompt?: string }> {
  let lastError = "";
  for (let attempt = 1; attempt <= MAX_API_ATTEMPTS; attempt++) {
    const response = await fetch(
      "https://api.openai.com/v1/images/generations",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      const requestId = response.headers.get("x-request-id");
      lastError = `OpenAI Images API error ${response.status}${
        requestId ? ` (${requestId})` : ""
      }: ${errorBody}`;
      if (attempt < MAX_API_ATTEMPTS && isRetryableStatus(response.status)) {
        await delay(retryDelayMs(response.headers.get("retry-after"), attempt));
        continue;
      }
      throw new Error(lastError);
    }

    const json = await response.json() as {
      data: Array<{ b64_json?: string; revised_prompt?: string }>;
    };
    const item = json.data[0];
    if (!item?.b64_json) {
      throw new Error("OpenAI Images API returned no image data");
    }
    return { b64Json: item.b64_json, revisedPrompt: item.revised_prompt };
  }

  throw new Error(lastError || "OpenAI Images API request failed");
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function retryDelayMs(retryAfter: string | null, attempt: number): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1000;
    }
    const timestamp = Date.parse(retryAfter);
    if (Number.isFinite(timestamp)) {
      return Math.max(timestamp - Date.now(), 0);
    }
  }
  return 250 * attempt;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (char) => char.charCodeAt(0));
}

async function writeCard(
  context: ModelContext,
  metadata: CardMetadata,
  imageBytes: Uint8Array,
  outputDir?: string,
): Promise<{ dataHandles: unknown[] }> {
  const imageWriter = context.createFileWriter("imageFile", "imageFile", {
    contentType: MIME_TYPES[metadata.format],
  });
  const fileHandle = await imageWriter.writeAll(imageBytes);

  if (outputDir) {
    await Deno.mkdir(outputDir, { recursive: true });
    await Deno.writeFile(`${outputDir}/${metadata.filename}`, imageBytes);
    metadata.outputPath = `${outputDir}/${metadata.filename}`;
    context.logger.info("Card image written to {outputPath}", {
      outputPath: metadata.outputPath,
    });
  }

  const cardHandle = await context.writeResource("card", "card", metadata);
  context.logger.info("Content card stored: {filename}", {
    filename: metadata.filename,
  });
  return { dataHandles: [cardHandle, fileHandle] };
}

/**
 * Playing-card shaped content image generator. It follows the content-image
 * API shape, then adds card metadata: sequence number, skill-level corner
 * number, related icon, optional logo, and a card-specific style vocabulary.
 */
export const model = {
  type: "@alvagante/content-card",
  version: "2026.06.21.1",
  globalArguments: z.object({
    apiKey: z.string().optional().meta({ sensitive: true }),
    outputDir: z.string().optional(),
  }),
  resources: {
    card: {
      description:
        "Generated content card metadata: prompt, corner values, style, filenames, and generation details",
      schema: CardSchema,
      lifetime: "infinite",
      garbageCollection: 20,
    },
  },
  files: {
    imageFile: {
      description: "Generated content card image",
      contentType: "image/png",
      lifetime: "infinite",
      garbageCollection: 20,
    },
  },
  methods: {
    generate: {
      description:
        "Generate a playing-card shaped content image using the OpenAI Images API.",
      arguments: z.object({
        prompt: z.string().min(1),
        title: z.string().min(1).optional(),
        text: z.string().min(1).optional(),
        cardNumber: z.number().int().positive().default(1),
        cardCount: z.number().int().positive().optional(),
        skillLevel: SkillLevelSchema.default("intermediate"),
        cornerIcon: z.string().min(1).optional(),
        logo: z.string().min(1).optional(),
        style: StylePresetSchema.default("vintage-playing-card"),
        model: z.string().default("gpt-image-1.5"),
        background: BackgroundSchema.default("opaque"),
        size: z.string().default("1024x1536"),
        quality: QualitySchema.default("auto"),
        format: OutputFormatSchema.default("png"),
        filename: z.string().optional(),
        outputDir: z.string().optional(),
      }),
      execute: async (
        args: {
          prompt: string;
          title?: string;
          text?: string;
          cardNumber: number;
          cardCount?: number;
          skillLevel: SkillLevel;
          cornerIcon?: string;
          logo?: string;
          style: StylePreset;
          model: string;
          background: Background;
          size: string;
          quality: Quality;
          format: OutputFormat;
          filename?: string;
          outputDir?: string;
        },
        context: ModelContext,
      ) => {
        const apiKey = context.globalArgs.apiKey;
        if (!apiKey) {
          throw new Error(
            "apiKey is required - set it in globalArguments or via a vault secret",
          );
        }
        if (args.cardCount !== undefined && args.cardNumber > args.cardCount) {
          throw new Error("cardNumber cannot be greater than cardCount");
        }
        if (
          args.background === "transparent" &&
          NO_TRANSPARENCY_MODELS.has(args.model)
        ) {
          throw new Error(
            `Model '${args.model}' does not support transparent backgrounds. Use gpt-image-1 or gpt-image-1.5.`,
          );
        }

        const outputDir = args.outputDir ?? context.globalArgs.outputDir;
        const filename = args.filename ??
          buildFilename(args.prompt, args.format);
        const augmentedPrompt = buildCardPrompt(args);
        const skillValue = SKILL_LEVEL_VALUES[args.skillLevel];

        context.logger.info("Generating content card {filename}", {
          prompt: args.prompt,
          cardNumber: args.cardNumber,
          cardCount: args.cardCount,
          skillLevel: args.skillLevel,
          skillValue,
          style: args.style,
          model: args.model,
          size: args.size,
          filename,
        });

        const requestBody = buildRequestBody({
          model: args.model,
          prompt: augmentedPrompt,
          size: args.size,
          background: args.background,
          format: args.format,
          quality: args.quality,
        });
        const { b64Json, revisedPrompt } = await callImagesApi(
          apiKey,
          requestBody,
        );
        const imageBytes = decodeBase64(b64Json);
        const metadata: CardMetadata = {
          prompt: args.prompt,
          augmentedPrompt,
          revisedPrompt,
          title: args.title,
          text: args.text,
          cardNumber: args.cardNumber,
          cardCount: args.cardCount,
          skillLevel: args.skillLevel,
          skillValue,
          cornerIcon: args.cornerIcon,
          logo: args.logo,
          model: args.model,
          style: args.style,
          background: args.background,
          size: args.size,
          quality: args.quality,
          format: args.format,
          filename,
          outputPath: outputDir ? `${outputDir}/${filename}` : undefined,
          generatedAt: new Date().toISOString(),
        };

        return await writeCard(context, metadata, imageBytes, outputDir);
      },
    },
  },
};

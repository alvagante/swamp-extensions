import { z } from "npm:zod@4";

const BackgroundSchema = z.enum(["opaque", "transparent", "auto"]);
const OutputFormatSchema = z.enum(["png", "webp", "jpeg"]);
const QualitySchema = z.enum(["auto", "low", "medium", "high"]);
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
]);

type Background = z.infer<typeof BackgroundSchema>;
type OutputFormat = z.infer<typeof OutputFormatSchema>;
type Quality = z.infer<typeof QualitySchema>;
type StylePreset = z.infer<typeof StylePresetSchema>;

const ImageSchema = z.object({
  prompt: z.string(),
  augmentedPrompt: z.string(),
  revisedPrompt: z.string().optional(),
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

type ModelContext = {
  globalArgs: {
    apiKey?: string;
    outputDir?: string;
  };
  writeResource: (
    specName: "image",
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

// Models that do NOT support the background / output_format parameters
const NO_TRANSPARENCY_MODELS = new Set(["dall-e-3", "gpt-image-2"]);

const STYLE_PREFIXES: Record<StylePreset, string> = {
  none: "",
  "ixen-dark":
    "Dark near-black background (#111), red accent (#cc0000), sharp technical cyberpunk aesthetic. High contrast, moody atmosphere, neon-on-dark color palette. ",
  "ixen-light":
    "Pencil sketch base with selective colored ink traits. Fine graphite lines for structure and shading; specific edges, connectors, or key details rendered as deliberate strokes of colored ink pen in sober muted tones (slate blue, terracotta, sage, or warm sepia — one or two colors at most). White or transparent background. Composition is slightly surrealist but restrained — technically accurate subject matter placed in quietly unexpected spatial relationships or with calm dreamlike proportions, closer to Magritte or De Chirico than Dali. Composed, not chaotic. ",
  "technical-diagram":
    "Clean white background, schematic blueprint style. Precise technical drawing, minimal color palette with blue or grey accents. Scientific and architectural feel. ",
  "cyberpunk-photo":
    "Photorealistic. Urban environment with neon lights, rain-slicked surfaces, high-tech low-life aesthetic. Cinematic lighting, rich atmospheric detail. ",
  "educational":
    "Clean bright background, friendly and approachable. Clear visual hierarchy. Textbook or infographic style. Accessible color palette. ",
  "pencil-bw":
    "Hand-drawn pencil illustration, technical and artistic. Fine pencil lines, cross-hatching for shading, precise technical detail combined with expressive draftsmanship. Strictly black and white — no color whatsoever, pure graphite tones. Transparent or white background. ",
  "pencil-color-accents":
    "Hand-drawn pencil illustration with selective color accents. Predominantly black and white pencil work with fine lines and cross-hatching. One or two focal elements — the most important or interesting parts of the subject — pop with isolated flashes of vivid color; everything else remains strict monochrome pencil. Transparent or white background. ",
  "blueprint":
    "Architectural and engineering blueprint. Fine precise white lines on deep navy blue (#003366). Orthographic or isometric projection, dimension lines with arrows, leader annotations, section cuts, hatching for materials. Classic drafting-table aesthetic, technical precision. ",
};

const MIME_TYPES: Record<OutputFormat, string> = {
  png: "image/png",
  webp: "image/webp",
  jpeg: "image/jpeg",
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function buildFilename(prompt: string, format: OutputFormat): string {
  const slug = slugify(prompt.split(" ").slice(0, 6).join(" "));
  const ts = Date.now().toString(36);
  return `${slug}-${ts}.${format}`;
}

function augmentPrompt(prompt: string, style: StylePreset): string {
  const prefix = STYLE_PREFIXES[style];
  return prefix ? `${prefix}${prompt}` : prompt;
}

function buildRequestBody(params: {
  model: string;
  prompt: string;
  size: string;
  background: Background;
  format: OutputFormat;
  quality: Quality;
}): Record<string, unknown> {
  const { model, prompt, size, background, format, quality } = params;

  if (model === "dall-e-3") {
    return {
      model,
      prompt,
      n: 1,
      size: size === "auto" ? "1024x1024" : size,
      quality: quality === "high" ? "hd" : "standard",
      response_format: "b64_json",
    };
  }

  const body: Record<string, unknown> = {
    model,
    prompt,
    n: 1,
    size,
    output_format: format,
    quality,
  };
  if (!NO_TRANSPARENCY_MODELS.has(model)) {
    body.background = background;
  }
  return body;
}

async function callImagesApi(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<{ b64Json: string; revisedPrompt?: string }> {
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI Images API error ${response.status}: ${errorBody}`);
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

function decodeBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/**
 * Image generator using the OpenAI Images API. Defaults to gpt-image-1.5
 * (the latest model) which supports transparent PNG output, style presets,
 * and flexible sizes. Images are stored in swamp and optionally written to a
 * shared outputDir for composing multi-media mini-sites alongside
 * content-ixen pages — reference the returned filename as a relative path.
 */
export const model = {
  type: "@alvagante/content-image",
  version: "2026.06.15.2",
  globalArguments: z.object({
    apiKey: z.string().optional().meta({ sensitive: true }),
    outputDir: z.string().optional(),
  }),
  resources: {
    image: {
      description: "Generated image metadata",
      schema: ImageSchema,
      lifetime: "infinite",
      garbageCollection: 20,
    },
  },
  files: {
    imageFile: {
      description: "Generated image binary (PNG, WebP, or JPEG)",
      contentType: "image/png",
      lifetime: "infinite",
      garbageCollection: 20,
    },
  },
  methods: {
    generate: {
      description:
        "Generate an image from a text prompt using the OpenAI Images API. Use gpt-image-1 or gpt-image-1.5 for transparent PNG output.",
      arguments: z.object({
        prompt: z.string().min(1),
        style: StylePresetSchema.default("none"),
        model: z.string().default("gpt-image-1.5"),
        background: BackgroundSchema.default("opaque"),
        size: z.string().default("1024x1024"),
        quality: QualitySchema.default("auto"),
        format: OutputFormatSchema.default("png"),
        filename: z.string().optional(),
        outputDir: z.string().optional(),
      }),
      execute: async (
        args: {
          prompt: string;
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
        const { apiKey, outputDir: globalOutputDir } = context.globalArgs;
        const outputDir = args.outputDir ?? globalOutputDir;
        if (!apiKey) {
          throw new Error(
            "apiKey is required — set it in globalArguments or via a vault secret",
          );
        }

        if (
          args.background === "transparent" &&
          NO_TRANSPARENCY_MODELS.has(args.model)
        ) {
          throw new Error(
            `Model '${args.model}' does not support transparent backgrounds. Use gpt-image-1 or gpt-image-1.5.`,
          );
        }

        const augmentedPrompt = augmentPrompt(args.prompt, args.style);
        const filename = args.filename ??
          buildFilename(args.prompt, args.format);

        context.logger.info("Generating image {filename}", {
          prompt: args.prompt,
          style: args.style,
          model: args.model,
          background: args.background,
          size: args.size,
          quality: args.quality,
          format: args.format,
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

        const writer = context.createFileWriter("imageFile", "imageFile", {
          contentType: MIME_TYPES[args.format],
        });
        const fileHandle = await writer.writeAll(imageBytes);

        let outputPath: string | undefined;
        if (outputDir) {
          await Deno.mkdir(outputDir, { recursive: true });
          outputPath = `${outputDir}/${filename}`;
          await Deno.writeFile(outputPath, imageBytes);
          context.logger.info("Image written to {outputPath}", { outputPath });
        }

        const imageHandle = await context.writeResource("image", "image", {
          prompt: args.prompt,
          augmentedPrompt,
          revisedPrompt,
          model: args.model,
          style: args.style,
          background: args.background,
          size: args.size,
          quality: args.quality,
          format: args.format,
          filename,
          outputPath,
          generatedAt: new Date().toISOString(),
        });

        return { dataHandles: [imageHandle, fileHandle] };
      },
    },
  },
};

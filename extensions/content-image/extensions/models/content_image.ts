import { z } from "npm:zod@4";
import { Jimp } from "npm:jimp@1.6.1";
import {
  type Background,
  BackgroundSchema,
  type Branding,
  BrandingSchema,
  IMAGE_STYLE_PREFIXES,
  type ImageFormat,
  ImageFormatSchema,
  type ImageStyle,
  ImageStyleSchema,
  type Quality,
  QualitySchema,
} from "./content_shared.ts";

const StylePresetSchema = ImageStyleSchema;
type StylePreset = ImageStyle;

const OutputFormatSchema = ImageFormatSchema;
type OutputFormat = ImageFormat;

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
    branding?: Branding;
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

const STYLE_PREFIXES = IMAGE_STYLE_PREFIXES;

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

async function overlayLogo(
  imageBytes: Uint8Array,
  logoPath: string,
  mimeType: string,
): Promise<Uint8Array> {
  const base = await Jimp.fromBuffer(imageBytes);
  const logo = await Jimp.read(logoPath);
  const targetW = Math.round(base.width * 0.12);
  logo.resize({ width: targetW });
  const x = base.width - logo.width - 16;
  const y = base.height - logo.height - 16;
  base.composite(logo, x, y);
  const buf = await base.getBuffer(mimeType);
  return new Uint8Array(buf);
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
  version: "2026.06.23.3",
  globalArguments: z.object({
    apiKey: z.string().optional().meta({ sensitive: true }),
    outputDir: z.string().optional(),
    branding: BrandingSchema.optional(),
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
        let imageBytes = decodeBase64(b64Json);

        const branding = context.globalArgs.branding;
        if (branding?.logo) {
          if (args.format === "webp") {
            context.logger.info(
              "Logo overlay skipped — WebP output not supported for compositing",
            );
          } else {
            imageBytes = await overlayLogo(
              imageBytes,
              branding.logo,
              MIME_TYPES[args.format],
            );
          }
        }

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

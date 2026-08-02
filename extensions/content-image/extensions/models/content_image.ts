import { z } from "npm:zod@4";
import UPNG from "npm:upng-js@2.1.0";
import * as jpeg from "npm:jpeg-js@0.4.4";
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

const NO_TRANSPARENT_BACKGROUND_MODELS = new Set(["dall-e-3", "gpt-image-2"]);

const STYLE_PREFIXES = IMAGE_STYLE_PREFIXES;

const MIME_TYPES: Record<OutputFormat, string> = {
  png: "image/png",
  webp: "image/webp",
  jpeg: "image/jpeg",
};
const COMPOSITE_MIME_TYPES: Record<
  Exclude<OutputFormat, "webp">,
  "image/png" | "image/jpeg"
> = {
  png: "image/png",
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
  if (!NO_TRANSPARENT_BACKGROUND_MODELS.has(model)) {
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

// Logo overlay uses pure-JS codecs (upng-js ships its own inflate, jpeg-js is
// plain typed arrays): Jimp's pngjs codec relies on Node zlib internals
// (Inflate._processChunk) that break under swamp's Deno runtime.
type RgbaImage = { width: number; height: number; rgba: Uint8Array };

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function isPng(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x89 && bytes[1] === 0x50 &&
    bytes[2] === 0x4e && bytes[3] === 0x47;
}

function decodeRgba(bytes: Uint8Array): RgbaImage {
  if (isPng(bytes)) {
    const img = UPNG.decode(toArrayBuffer(bytes));
    return {
      width: img.width,
      height: img.height,
      rgba: new Uint8Array(UPNG.toRGBA8(img)[0]),
    };
  }
  const img = jpeg.decode(bytes, { useTArray: true });
  return { width: img.width, height: img.height, rgba: img.data };
}

function encodeRgba(
  img: RgbaImage,
  mimeType: "image/png" | "image/jpeg",
): Uint8Array {
  if (mimeType === "image/png") {
    return new Uint8Array(
      UPNG.encode([toArrayBuffer(img.rgba)], img.width, img.height, 0),
    );
  }
  return new Uint8Array(
    jpeg.encode({ data: img.rgba, width: img.width, height: img.height }, 90)
      .data,
  );
}

function downscaleToWidth(src: RgbaImage, targetW: number): RgbaImage {
  const width = Math.max(1, targetW);
  const scale = src.width / width;
  const height = Math.max(1, Math.round(src.height / scale));
  const out = new Uint8Array(width * height * 4);
  for (let ty = 0; ty < height; ty++) {
    const y0 = Math.floor(ty * scale);
    const y1 = Math.min(
      src.height,
      Math.max(y0 + 1, Math.ceil((ty + 1) * scale)),
    );
    for (let tx = 0; tx < width; tx++) {
      const x0 = Math.floor(tx * scale);
      const x1 = Math.min(
        src.width,
        Math.max(x0 + 1, Math.ceil((tx + 1) * scale)),
      );
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * src.width + x) * 4;
          const alpha = src.rgba[i + 3];
          r += src.rgba[i] * alpha;
          g += src.rgba[i + 1] * alpha;
          b += src.rgba[i + 2] * alpha;
          a += alpha;
          n++;
        }
      }
      const o = (ty * width + tx) * 4;
      out[o] = a ? Math.round(r / a) : 0;
      out[o + 1] = a ? Math.round(g / a) : 0;
      out[o + 2] = a ? Math.round(b / a) : 0;
      out[o + 3] = Math.round(a / n);
    }
  }
  return { width, height, rgba: out };
}

function compositeSrcOver(
  base: RgbaImage,
  overlay: RgbaImage,
  ox: number,
  oy: number,
): void {
  for (let y = 0; y < overlay.height; y++) {
    const by = oy + y;
    if (by < 0 || by >= base.height) continue;
    for (let x = 0; x < overlay.width; x++) {
      const bx = ox + x;
      if (bx < 0 || bx >= base.width) continue;
      const si = (y * overlay.width + x) * 4;
      const sa = overlay.rgba[si + 3] / 255;
      if (sa === 0) continue;
      const di = (by * base.width + bx) * 4;
      const da = base.rgba[di + 3] / 255;
      const outA = sa + da * (1 - sa);
      for (let c = 0; c < 3; c++) {
        base.rgba[di + c] = Math.round(
          (overlay.rgba[si + c] * sa + base.rgba[di + c] * da * (1 - sa)) /
            outA,
        );
      }
      base.rgba[di + 3] = Math.round(outA * 255);
    }
  }
}

async function overlayLogo(
  imageBytes: Uint8Array,
  logoPath: string,
  mimeType: "image/png" | "image/jpeg",
): Promise<Uint8Array> {
  const base = decodeRgba(imageBytes);
  const logo = decodeRgba(await Deno.readFile(logoPath));
  const scaled = downscaleToWidth(logo, Math.round(base.width * 0.12));
  const x = base.width - scaled.width - 16;
  const y = base.height - scaled.height - 16;
  compositeSrcOver(base, scaled, x, y);
  return encodeRgba(base, mimeType);
}

/**
 * Image generator using the OpenAI Images API. Defaults to gpt-image-1.5
 * (supports transparent PNG output), style presets, and flexible sizes. Images
 * are stored in swamp and optionally written to a shared outputDir for composing
 * multi-media mini-sites alongside content-ixen pages — reference the returned
 * filename as a relative path.
 */
export const model = {
  type: "@alvagante/content-image",
  version: "2026.08.02.1",
  globalArguments: z.object({
    apiKey: z.string().optional().meta({ sensitive: true }),
    outputDir: z.string().optional(),
    branding: BrandingSchema.optional(),
  }),
  upgrades: [
    {
      toVersion: "2026.07.05.1",
      description:
        "Replace Jimp with pure-JS codecs for the branding logo overlay; no globalArguments schema changes",
      upgradeAttributes: (old: Record<string, unknown>) => old,
    },
    {
      toVersion: "2026.08.02.1",
      description:
        "Sync shared/content_shared.ts (adds douglasadams persona preset upstream; this extension does not expose a persona argument, no functional change)",
      upgradeAttributes: (old: Record<string, unknown>) => old,
    },
  ],
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
          NO_TRANSPARENT_BACKGROUND_MODELS.has(args.model)
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
              COMPOSITE_MIME_TYPES[args.format],
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

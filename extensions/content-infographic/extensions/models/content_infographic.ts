import { z } from "npm:zod@4";

const BackgroundSchema = z.enum(["opaque", "transparent", "auto"]);
const OutputFormatSchema = z.enum(["png", "webp", "jpeg"]);
const QualitySchema = z.enum(["auto", "low", "medium", "high"]);
const OrientationSchema = z.enum(["wide", "portrait", "square"]);
const StylePresetSchema = z.enum([
  "clean",
  "technical",
  "ixen",
  "editorial",
  "blueprint",
]);

type Background = z.infer<typeof BackgroundSchema>;
type OutputFormat = z.infer<typeof OutputFormatSchema>;
type Quality = z.infer<typeof QualitySchema>;
type Orientation = z.infer<typeof OrientationSchema>;
type StylePreset = z.infer<typeof StylePresetSchema>;

const InfographicSchema = z.object({
  title: z.string(),
  topic: z.string(),
  details: z.string().optional(),
  keyPoints: z.array(z.string()),
  prompt: z.string(),
  augmentedPrompt: z.string(),
  revisedPrompt: z.string().optional(),
  model: z.string(),
  style: StylePresetSchema,
  orientation: OrientationSchema,
  background: BackgroundSchema,
  size: z.string(),
  quality: QualitySchema,
  format: OutputFormatSchema,
  filename: z.string(),
  htmlFilename: z.string(),
  imagePath: z.string().optional(),
  htmlPath: z.string().optional(),
  generatedAt: z.string(),
});

type InfographicMetadata = z.infer<typeof InfographicSchema>;

type ModelContext = {
  globalArgs: {
    apiKey?: string;
    outputDir?: string;
  };
  writeResource: (
    specName: "infographic",
    name: string,
    content: unknown,
  ) => Promise<unknown>;
  createFileWriter: (
    specName: "html" | "imageFile",
    name: string,
    overrides?: { contentType?: string },
  ) => {
    writeText?: (text: string) => Promise<unknown>;
    writeAll?: (bytes: Uint8Array) => Promise<unknown>;
  };
  logger: {
    info: (msg: string, props?: Record<string, unknown>) => void;
    error: (msg: string, props?: Record<string, unknown>) => void;
  };
};

const MIME_TYPES: Record<OutputFormat, string> = {
  png: "image/png",
  webp: "image/webp",
  jpeg: "image/jpeg",
};

const STYLE_PREFIXES: Record<StylePreset, string> = {
  clean:
    "Modern clean information design, precise hierarchy, sober accent colors, ample whitespace, accessible contrast. ",
  technical:
    "Technical systems infographic, diagrams, flows, labeled blocks, restrained palette, engineering-document clarity. ",
  ixen:
    "Near-white technical zine aesthetic with black ink, one strong red accent (#cc0000), sparse 2005 web sensibility, philosophical but legible. ",
  editorial:
    "Magazine editorial infographic, strong composition, refined typography, visual storytelling, clear visual rhythm. ",
  blueprint:
    "Blueprint-style information graphic with fine white linework on deep navy, dimension lines, callouts, precise schematic layout. ",
};

const DEFAULT_SIZE: Record<Orientation, string> = {
  wide: "1536x1024",
  portrait: "1024x1536",
  square: "1024x1024",
};

const NO_TRANSPARENCY_MODELS = new Set(["dall-e-3", "gpt-image-2"]);

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "infographic";
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildImageFilename(title: string, format: OutputFormat): string {
  return `${slugify(title)}-${Date.now().toString(36)}.${format}`;
}

function buildHtmlFilename(title: string): string {
  return `${slugify(title)}-infographic.html`;
}

function augmentPrompt(params: {
  title: string;
  topic: string;
  details?: string;
  keyPoints: string[];
  style: StylePreset;
  orientation: Orientation;
}): string {
  const keyPointText = params.keyPoints.length > 0
    ? `Key points to visualize: ${params.keyPoints.join("; ")}. `
    : "";
  const details = params.details ? `Context: ${params.details}. ` : "";
  return `${
    STYLE_PREFIXES[params.style]
  }Create a polished ${params.orientation} infographic visual for "${params.title}" about ${params.topic}. ${details}${keyPointText}Use concise labels only; avoid paragraphs and tiny text. Leave the detailed explanatory copy to the surrounding HTML page.`;
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
      size: params.size === "auto" ? "1024x1024" : params.size,
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
    throw new Error(
      `OpenAI Images API error ${response.status}: ${errorBody}`,
    );
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
  return Uint8Array.from(atob(b64), (char) => char.charCodeAt(0));
}

function renderInfographicPage(
  metadata: InfographicMetadata,
  imageSrc: string,
): string {
  const keyPoints = metadata.keyPoints.length > 0
    ? `<ol class="ig-points">${
      metadata.keyPoints.map((point) => `<li>${escapeHtml(point)}</li>`).join(
        "",
      )
    }</ol>`
    : "";
  const details = metadata.details
    ? `<p class="ig-details">${escapeHtml(metadata.details)}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(metadata.title)}</title>
<style>
:root {
  --ig-ink: #161616;
  --ig-dim: #5f6368;
  --ig-line: #d9d9d9;
  --ig-red: #c00;
  --ig-paper: #fff;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  color: var(--ig-ink);
  background: #f4f4f1;
}
main {
  max-width: 1180px;
  margin: 0 auto;
  padding: clamp(1rem, 3vw, 2.5rem);
}
.ig-shell {
  background: var(--ig-paper);
  border: 1px solid var(--ig-line);
  box-shadow: 0 18px 60px rgba(0,0,0,0.08);
}
header {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 1rem;
  align-items: start;
  padding: clamp(1.2rem, 3vw, 2rem);
  border-bottom: 3px solid var(--ig-red);
}
h1 {
  margin: 0;
  font-family: Georgia, "Times New Roman", serif;
  font-size: clamp(2rem, 5vw, 4.2rem);
  line-height: 0.95;
  letter-spacing: 0;
  text-transform: uppercase;
}
.ig-meta {
  color: var(--ig-dim);
  font-family: "Courier New", Courier, monospace;
  font-size: 0.78rem;
  text-align: right;
  white-space: nowrap;
}
.ig-content {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(260px, 0.65fr);
  gap: clamp(1rem, 3vw, 2rem);
  padding: clamp(1rem, 3vw, 2rem);
}
figure { margin: 0; }
img {
  display: block;
  width: 100%;
  height: auto;
  border: 1px solid var(--ig-line);
}
figcaption {
  margin-top: 0.5rem;
  color: var(--ig-dim);
  font-size: 0.82rem;
}
.ig-copy {
  border-left: 1px solid var(--ig-line);
  padding-left: clamp(1rem, 2vw, 1.5rem);
}
.ig-topic {
  margin: 0 0 1rem;
  color: var(--ig-red);
  font-family: "Courier New", Courier, monospace;
  font-weight: 700;
  text-transform: uppercase;
}
.ig-details {
  margin: 0 0 1.2rem;
  color: var(--ig-dim);
  line-height: 1.5;
}
.ig-points {
  margin: 0;
  padding-left: 1.4rem;
}
.ig-points li {
  margin: 0 0 0.85rem;
  padding-left: 0.25rem;
  line-height: 1.45;
}
footer {
  padding: 0.8rem clamp(1rem, 3vw, 2rem) 1rem;
  border-top: 1px solid var(--ig-line);
  color: var(--ig-dim);
  font-family: "Courier New", Courier, monospace;
  font-size: 0.72rem;
}
@media (max-width: 760px) {
  header { grid-template-columns: 1fr; }
  .ig-meta { text-align: left; white-space: normal; }
  .ig-content { grid-template-columns: 1fr; }
  .ig-copy { border-left: 0; border-top: 1px solid var(--ig-line); padding-left: 0; padding-top: 1rem; }
}
</style>
</head>
<body>
<!-- @alvagante/content-infographic -->
<main>
  <article class="ig-shell">
    <header>
      <h1>${escapeHtml(metadata.title)}</h1>
      <div class="ig-meta">${
    escapeHtml(metadata.generatedAt.slice(0, 10))
  }<br>model: ${escapeHtml(metadata.model)}</div>
    </header>
    <section class="ig-content">
      <figure>
        <img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(metadata.prompt)}">
        <figcaption>${escapeHtml(metadata.topic)}</figcaption>
      </figure>
      <aside class="ig-copy">
        <p class="ig-topic">${escapeHtml(metadata.topic)}</p>
        ${details}
        ${keyPoints}
      </aside>
    </section>
    <footer>${escapeHtml(metadata.style)} / ${
    escapeHtml(metadata.orientation)
  } / ${escapeHtml(metadata.size)}</footer>
  </article>
</main>
</body>
</html>`;
}

async function writeInfographic(
  context: ModelContext,
  metadata: InfographicMetadata,
  imageBytes: Uint8Array,
  imageB64: string,
  outputDir?: string,
): Promise<{ dataHandles: unknown[] }> {
  const handles: unknown[] = [];
  const resourceHandle = await context.writeResource(
    "infographic",
    "main",
    metadata,
  );
  handles.push(resourceHandle);

  const imageWriter = context.createFileWriter("imageFile", "imageFile", {
    contentType: MIME_TYPES[metadata.format],
  });
  if (!imageWriter.writeAll) {
    throw new Error("imageFile writer does not support binary writes");
  }
  handles.push(await imageWriter.writeAll(imageBytes));

  const imageSrc = outputDir
    ? `./${metadata.filename}`
    : `data:${MIME_TYPES[metadata.format]};base64,${imageB64}`;
  const html = renderInfographicPage(metadata, imageSrc);
  const htmlWriter = context.createFileWriter("html", "html");
  if (!htmlWriter.writeText) {
    throw new Error("html writer does not support text writes");
  }
  handles.push(await htmlWriter.writeText(html));

  if (outputDir) {
    await Deno.mkdir(outputDir, { recursive: true });
    await Deno.writeFile(`${outputDir}/${metadata.filename}`, imageBytes);
    await Deno.writeTextFile(`${outputDir}/${metadata.htmlFilename}`, html);
    context.logger.info("Infographic written to {outputDir}/{htmlFilename}", {
      outputDir,
      htmlFilename: metadata.htmlFilename,
    });
  }

  context.logger.info("Infographic stored: {title}", {
    title: metadata.title,
    filename: metadata.filename,
    htmlFilename: metadata.htmlFilename,
  });

  return { dataHandles: handles };
}

/**
 * Infographic generator using the OpenAI Images API. It stores the generated
 * image plus a browser-ready HTML infographic page. The HTML keeps explanatory
 * text reliable while the OpenAI image carries the visual composition.
 */
export const model = {
  type: "@alvagante/content-infographic",
  version: "2026.06.19.1",
  globalArguments: z.object({
    apiKey: z.string().optional().meta({ sensitive: true }),
    outputDir: z.string().optional(),
  }),
  resources: {
    infographic: {
      description: "Generated infographic metadata",
      schema: InfographicSchema,
      lifetime: "infinite",
      garbageCollection: 20,
    },
  },
  files: {
    html: {
      description: "Self-contained infographic HTML page",
      contentType: "text/html",
      lifetime: "infinite",
      garbageCollection: 20,
    },
    imageFile: {
      description: "Generated infographic image",
      contentType: "image/png",
      lifetime: "infinite",
      garbageCollection: 20,
    },
  },
  methods: {
    generate: {
      description:
        "Generate an infographic image with OpenAI and wrap it in a reliable HTML page suitable for embedding in content-ixen.",
      arguments: z.object({
        topic: z.string().min(1),
        title: z.string().min(1).optional(),
        details: z.string().optional(),
        keyPoints: z.array(z.string().min(1)).default([]),
        style: StylePresetSchema.default("clean"),
        orientation: OrientationSchema.default("wide"),
        model: z.string().default("gpt-image-2"),
        background: BackgroundSchema.default("opaque"),
        size: z.string().optional(),
        quality: QualitySchema.default("auto"),
        format: OutputFormatSchema.default("png"),
        filename: z.string().optional(),
        htmlFilename: z.string().optional(),
        outputDir: z.string().optional(),
      }),
      execute: async (
        args: {
          topic: string;
          title?: string;
          details?: string;
          keyPoints: string[];
          style: StylePreset;
          orientation: Orientation;
          model: string;
          background: Background;
          size?: string;
          quality: Quality;
          format: OutputFormat;
          filename?: string;
          htmlFilename?: string;
          outputDir?: string;
        },
        context: ModelContext,
      ) => {
        const apiKey = context.globalArgs.apiKey;
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

        const title = args.title ?? `${args.topic} Infographic`;
        const size = args.size ?? DEFAULT_SIZE[args.orientation];
        const filename = args.filename ??
          buildImageFilename(title, args.format);
        const htmlFilename = args.htmlFilename ?? buildHtmlFilename(title);
        const outputDir = args.outputDir ?? context.globalArgs.outputDir;
        const augmentedPrompt = augmentPrompt({
          title,
          topic: args.topic,
          details: args.details,
          keyPoints: args.keyPoints,
          style: args.style,
          orientation: args.orientation,
        });

        context.logger.info("Generating infographic", {
          topic: args.topic,
          title,
          model: args.model,
          style: args.style,
          orientation: args.orientation,
          size,
          filename,
          htmlFilename,
        });

        const requestBody = buildRequestBody({
          model: args.model,
          prompt: augmentedPrompt,
          size,
          background: args.background,
          format: args.format,
          quality: args.quality,
        });
        const { b64Json, revisedPrompt } = await callImagesApi(
          apiKey,
          requestBody,
        );
        const imageBytes = decodeBase64(b64Json);
        const generatedAt = new Date().toISOString();
        const metadata: InfographicMetadata = {
          title,
          topic: args.topic,
          details: args.details,
          keyPoints: args.keyPoints,
          prompt: augmentedPrompt,
          augmentedPrompt,
          revisedPrompt,
          model: args.model,
          style: args.style,
          orientation: args.orientation,
          background: args.background,
          size,
          quality: args.quality,
          format: args.format,
          filename,
          htmlFilename,
          imagePath: outputDir ? `${outputDir}/${filename}` : undefined,
          htmlPath: outputDir ? `${outputDir}/${htmlFilename}` : undefined,
          generatedAt,
        };

        return await writeInfographic(
          context,
          metadata,
          imageBytes,
          b64Json,
          outputDir,
        );
      },
    },
    save: {
      description:
        "Store an externally provided infographic image without calling OpenAI, wrapping it in the same HTML page shell.",
      arguments: z.object({
        topic: z.string().min(1),
        title: z.string().min(1).optional(),
        details: z.string().optional(),
        keyPoints: z.array(z.string().min(1)).default([]),
        imageBase64: z.string().min(1),
        style: StylePresetSchema.default("clean"),
        orientation: OrientationSchema.default("wide"),
        background: BackgroundSchema.default("opaque"),
        size: z.string().optional(),
        quality: QualitySchema.default("auto"),
        format: OutputFormatSchema.default("png"),
        filename: z.string().optional(),
        htmlFilename: z.string().optional(),
        model: z.string().default("external"),
        outputDir: z.string().optional(),
      }),
      execute: async (
        args: {
          topic: string;
          title?: string;
          details?: string;
          keyPoints: string[];
          imageBase64: string;
          style: StylePreset;
          orientation: Orientation;
          background: Background;
          size?: string;
          quality: Quality;
          format: OutputFormat;
          filename?: string;
          htmlFilename?: string;
          model: string;
          outputDir?: string;
        },
        context: ModelContext,
      ) => {
        context.logger.info("Saving externally provided infographic", {
          topic: args.topic,
          title: args.title ?? `${args.topic} Infographic`,
          model: args.model,
        });

        const title = args.title ?? `${args.topic} Infographic`;
        const size = args.size ?? DEFAULT_SIZE[args.orientation];
        const filename = args.filename ??
          buildImageFilename(title, args.format);
        const htmlFilename = args.htmlFilename ?? buildHtmlFilename(title);
        const outputDir = args.outputDir ?? context.globalArgs.outputDir;
        const prompt = `External infographic image for ${title}`;
        const imageBytes = decodeBase64(args.imageBase64);
        const generatedAt = new Date().toISOString();
        const metadata: InfographicMetadata = {
          title,
          topic: args.topic,
          details: args.details,
          keyPoints: args.keyPoints,
          prompt,
          augmentedPrompt: prompt,
          model: args.model,
          style: args.style,
          orientation: args.orientation,
          background: args.background,
          size,
          quality: args.quality,
          format: args.format,
          filename,
          htmlFilename,
          imagePath: outputDir ? `${outputDir}/${filename}` : undefined,
          htmlPath: outputDir ? `${outputDir}/${htmlFilename}` : undefined,
          generatedAt,
        };

        return await writeInfographic(
          context,
          metadata,
          imageBytes,
          args.imageBase64,
          outputDir,
        );
      },
    },
  },
};

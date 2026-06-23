import { Buffer } from "node:buffer";
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

const OrientationSchema = z.enum(["wide", "portrait", "square"]);

type Orientation = z.infer<typeof OrientationSchema>;

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
    branding?: Branding;
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

const STYLE_PREFIXES = IMAGE_STYLE_PREFIXES;

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

function renderInfographicPage(
  metadata: InfographicMetadata,
  imageSrc: string,
): string {
  const keyPointItems = metadata.keyPoints
    .map((p) => `<li>${escapeHtml(p)}</li>`)
    .join("");
  const keyPointsHtml = keyPointItems
    ? `<div class="ig-copy">
      <p class="ig-topic">${escapeHtml(metadata.topic)}</p>
      <ul class="ig-points">${keyPointItems}</ul>
    </div>`
    : "";

  const revisedSection = metadata.revisedPrompt
    ? `<h3 class="ig-pdlg-h3">Revised by model</h3><pre class="ig-pdlg-pre">${
      escapeHtml(metadata.revisedPrompt)
    }</pre>`
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
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
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
  font-family: Georgia, "Times New Roman", serif;
  font-size: clamp(1.8rem, 4vw, 3.6rem);
  line-height: 0.95;
  text-transform: uppercase;
}
.ig-meta {
  color: var(--ig-dim);
  font-family: "Courier New", Courier, monospace;
  font-size: 0.78rem;
  text-align: right;
  white-space: nowrap;
}
figure {
  padding: clamp(1rem, 3vw, 2rem);
  padding-bottom: 0.5rem;
}
.ig-img-wrap {
  position: relative;
  cursor: zoom-in;
}
.ig-img-wrap::after {
  content: "⤢";
  position: absolute;
  bottom: 0.4rem;
  right: 0.4rem;
  background: rgba(0,0,0,0.55);
  color: #fff;
  font-size: 1rem;
  padding: 0.15rem 0.4rem;
  border-radius: 2px;
  line-height: 1.4;
  opacity: 0;
  transition: opacity 0.15s;
  pointer-events: none;
}
.ig-img-wrap:hover::after { opacity: 1; }
img.ig-main {
  display: block;
  width: 100%;
  height: auto;
  border: 1px solid var(--ig-line);
}
figcaption {
  padding: 0.4rem clamp(1rem, 3vw, 2rem) 0;
  color: var(--ig-dim);
  font-size: 0.82rem;
}
.ig-copy {
  padding: clamp(0.8rem, 2vw, 1.2rem) clamp(1rem, 3vw, 2rem) clamp(1rem, 3vw, 1.5rem);
  border-top: 1px solid var(--ig-line);
  margin-top: clamp(1rem, 2vw, 1.5rem);
}
.ig-topic {
  margin-bottom: 0.75rem;
  color: var(--ig-red);
  font-family: "Courier New", Courier, monospace;
  font-weight: 700;
  font-size: 0.8rem;
  text-transform: uppercase;
}
.ig-points {
  padding-left: 1.4rem;
  columns: 2;
  column-gap: 2rem;
}
.ig-points li {
  margin-bottom: 0.7rem;
  padding-left: 0.2rem;
  line-height: 1.45;
  break-inside: avoid;
}
footer {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.7rem clamp(1rem, 3vw, 2rem) 0.9rem;
  border-top: 1px solid var(--ig-line);
  color: var(--ig-dim);
  font-family: "Courier New", Courier, monospace;
  font-size: 0.72rem;
}
.ig-footer-spacer { flex: 1; }
.ig-btn {
  background: none;
  border: 1px solid var(--ig-line);
  color: var(--ig-dim);
  font-family: "Courier New", Courier, monospace;
  font-size: 0.72rem;
  padding: 0.2rem 0.6rem;
  cursor: pointer;
  border-radius: 2px;
  text-decoration: none;
  display: inline-block;
}
.ig-btn:hover { border-color: var(--ig-ink); color: var(--ig-ink); }

/* Lightbox — fills the iframe viewport via showModal() top-layer */
dialog.ig-lightbox {
  padding: 0;
  border: 0;
  background: rgba(0,0,0,0.9);
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  inset: 0;
  margin: 0;
}
dialog.ig-lightbox::backdrop { background: rgba(0,0,0,0.65); }
.ig-lb-inner {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}
.ig-lb-img {
  max-width: 96%;
  max-height: 94%;
  object-fit: contain;
  transform-origin: center center;
  transition: transform 0.08s ease;
  user-select: none;
}
.ig-lb-close {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  background: rgba(255,255,255,0.12);
  border: 1px solid rgba(255,255,255,0.2);
  color: #fff;
  font-size: 1.2rem;
  line-height: 1;
  width: 2.2rem;
  height: 2.2rem;
  border-radius: 50%;
  cursor: pointer;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ig-lb-close:hover { background: rgba(255,255,255,0.25); }
.ig-lb-hint {
  position: absolute;
  bottom: 0.75rem;
  left: 50%;
  transform: translateX(-50%);
  color: rgba(255,255,255,0.4);
  font-family: "Courier New", Courier, monospace;
  font-size: 0.68rem;
  pointer-events: none;
  white-space: nowrap;
}

/* Prompt dialog */
dialog.ig-pdlg {
  max-width: min(720px, 92vw);
  width: 100%;
  max-height: 80%;
  padding: 1.75rem;
  border: 1px solid var(--ig-line);
  border-radius: 4px;
  overflow-y: auto;
  position: relative;
}
dialog.ig-pdlg::backdrop { background: rgba(0,0,0,0.45); }
.ig-pdlg-close {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  background: none;
  border: 1px solid var(--ig-line);
  color: var(--ig-ink);
  font-size: 1rem;
  line-height: 1;
  width: 1.8rem;
  height: 1.8rem;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ig-pdlg-close:hover { background: var(--ig-line); }
.ig-pdlg-h2 {
  margin: 0 2rem 1rem 0;
  font-family: "Courier New", Courier, monospace;
  font-size: 0.82rem;
  text-transform: uppercase;
  color: var(--ig-red);
}
.ig-pdlg-h3 {
  margin: 1.25rem 0 0.5rem;
  font-family: "Courier New", Courier, monospace;
  font-size: 0.75rem;
  text-transform: uppercase;
  color: var(--ig-dim);
}
.ig-pdlg-pre {
  white-space: pre-wrap;
  font-family: "Courier New", Courier, monospace;
  font-size: 0.78rem;
  color: var(--ig-dim);
  line-height: 1.55;
}
@media (max-width: 600px) {
  header { grid-template-columns: 1fr; }
  .ig-meta { text-align: left; white-space: normal; }
  .ig-points { columns: 1; }
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
    <figure>
      <div class="ig-img-wrap" id="igImgWrap">
        <img class="ig-main" id="igImg" src="${escapeHtml(imageSrc)}" alt="${
    escapeHtml(metadata.title)
  }">
      </div>
    </figure>
    <figcaption>${escapeHtml(metadata.topic)}</figcaption>
    ${keyPointsHtml}
    <footer>
      <span>${escapeHtml(metadata.style)} / ${
    escapeHtml(metadata.orientation)
  } / ${escapeHtml(metadata.size)}</span>
      <span class="ig-footer-spacer"></span>
      <button class="ig-btn" id="igPromptBtn">view prompt</button>
    </footer>
  </article>
</main>

<dialog id="igLightbox" class="ig-lightbox">
  <div class="ig-lb-inner" id="igLbInner">
    <button class="ig-lb-close" id="igLbClose" aria-label="Close">×</button>
    <img class="ig-lb-img" id="igLbImg" src="" alt="${
    escapeHtml(metadata.title)
  }">
    <p class="ig-lb-hint">scroll to zoom · click outside image to close</p>
  </div>
</dialog>

<dialog id="igPromptDlg" class="ig-pdlg">
  <button class="ig-pdlg-close" id="igPromptClose" aria-label="Close">×</button>
  <h2 class="ig-pdlg-h2">Generation prompt</h2>
  <pre class="ig-pdlg-pre">${escapeHtml(metadata.augmentedPrompt)}</pre>
  ${revisedSection}
</dialog>

<script>
(function () {
  var img = document.getElementById('igImg');
  var imgWrap = document.getElementById('igImgWrap');
  var lightbox = document.getElementById('igLightbox');
  var lbImg = document.getElementById('igLbImg');
  var lbClose = document.getElementById('igLbClose');
  var lbInner = document.getElementById('igLbInner');
  var promptBtn = document.getElementById('igPromptBtn');
  var promptDlg = document.getElementById('igPromptDlg');
  var promptClose = document.getElementById('igPromptClose');
  var scale = 1;

  function openLightbox() {
    lbImg.src = img.src;
    scale = 1;
    lbImg.style.transform = 'scale(1)';
    lightbox.showModal();
  }

  function closeLightbox() {
    lightbox.close();
  }

  if (imgWrap) imgWrap.addEventListener('click', openLightbox);

  if (lbClose) lbClose.addEventListener('click', function (e) {
    e.stopPropagation();
    closeLightbox();
  });

  if (lbInner) lbInner.addEventListener('click', function (e) {
    if (e.target === lbInner) closeLightbox();
  });

  if (lightbox) {
    lightbox.addEventListener('wheel', function (e) {
      e.preventDefault();
      scale = Math.min(Math.max(scale - e.deltaY * 0.003, 0.5), 10);
      lbImg.style.transform = 'scale(' + scale + ')';
    }, { passive: false });
    lightbox.addEventListener('cancel', function () { scale = 1; });
  }

  if (promptBtn && promptDlg) {
    promptBtn.addEventListener('click', function () { promptDlg.showModal(); });
    promptClose.addEventListener('click', function () { promptDlg.close(); });
    promptDlg.addEventListener('click', function (e) {
      if (e.target === promptDlg) promptDlg.close();
    });
  }
}());
</script>
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
  version: "2026.06.23.3",
  globalArguments: z.object({
    apiKey: z.string().optional().meta({ sensitive: true }),
    outputDir: z.string().optional(),
    branding: BrandingSchema.optional(),
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
        let imageBytes = decodeBase64(b64Json);
        let imageB64 = b64Json;
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
            imageB64 = Buffer.from(imageBytes).toString("base64");
          }
        }
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
          imageB64,
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
        let imageBytes = decodeBase64(args.imageBase64);
        let imageB64 = args.imageBase64;
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
            imageB64 = Buffer.from(imageBytes).toString("base64");
          }
        }
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
          imageB64,
          outputDir,
        );
      },
    },
  },
};

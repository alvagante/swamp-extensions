import { z } from "npm:zod@4";

const SkillLevelSchema = z.enum(["novice", "intermediate", "senior", "guru"]);
const OutputLengthSchema = z.enum(["short", "medium", "long"]);
const ApiFormatSchema = z.enum(["anthropic", "openai-compat"]);

type SkillLevel = z.infer<typeof SkillLevelSchema>;
type OutputLength = z.infer<typeof OutputLengthSchema>;
type ApiFormat = z.infer<typeof ApiFormatSchema>;

const MediaItemSchema = z.object({
  path: z.string(),
  prompt: z.string().optional(),
});
type MediaItem = z.infer<typeof MediaItemSchema>;

function resolveMediaItems(
  media?: string,
  mediaItems?: MediaItem[],
): MediaItem[] {
  if (mediaItems && mediaItems.length > 0) return mediaItems;
  if (media) return [{ path: media }];
  return [];
}

const PageSchema = z.object({
  title: z.string(),
  narrator: z.string(),
  topic: z.string(),
  details: z.string().optional(),
  content: z.string(),
  wordCount: z.number().int().nonnegative(),
  skillLevel: SkillLevelSchema,
  outputLength: OutputLengthSchema,
  model: z.string(),
  media: z.string().optional(),
  mediaItems: z.array(MediaItemSchema).optional(),
  credits: z.string().optional(),
  generatedAt: z.string(),
});

type IxenPage = z.infer<typeof PageSchema>;

type ModelContext = {
  globalArgs: {
    apiFormat: ApiFormat;
    apiKey?: string;
    baseUrl?: string;
    outputDir?: string;
  };
  writeResource: (
    specName: "page",
    name: string,
    content: unknown,
  ) => Promise<unknown>;
  createFileWriter: (
    specName: "html",
    name: string,
  ) => {
    writeText: (text: string) => Promise<unknown>;
  };
  logger: {
    info: (msg: string, props?: Record<string, unknown>) => void;
    error: (msg: string, props?: Record<string, unknown>) => void;
  };
};

const SKILL_LEVEL_DIRECTIVES: Record<string, string> = {
  novice:
    "Skill level: NOVICE\nThe reader has no prior technical knowledge. Every command shown must be gently explained by the narration around it. Use concrete analogies from everyday life. The narrator patiently introduces its own world.",
  intermediate:
    "Skill level: INTERMEDIATE\nThe reader understands the fundamentals. Use standard terminology without defining basics. Commands and outputs can assume working familiarity; the narration adds the layer beneath.",
  senior:
    "Skill level: SENIOR\nThe reader is an experienced engineer. Skip fundamentals entirely. Commands, flags, and outputs should be realistic and non-trivial. The narration engages with tradeoffs, internals, and failure modes.",
  guru:
    "Skill level: GURU\nThe reader is a domain expert. Treat them as a peer. Dense technical depth, contested ideas, edge cases, and internals are expected. The narrator can be allusive — the reader will keep up.",
};

const MAX_TOKENS: Record<string, number> = {
  short: 4000,
  medium: 8000,
  long: 16000,
};

const DEFAULT_BASE_URL: Record<ApiFormat, string> = {
  "anthropic": "https://api.anthropic.com",
  "openai-compat": "http://localhost:11434/v1",
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
  maxTokens: number,
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
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    };
    if (supportsAdaptiveThinking(modelId)) {
      body.thinking = { type: "adaptive" };
    }
    return { url: `${baseUrl}/v1/messages`, headers, body };
  }

  // openai-compat
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (apiKey) headers["authorization"] = `Bearer ${apiKey}`;
  return {
    url: `${baseUrl}/chat/completions`,
    headers,
    body: {
      model: modelId,
      max_tokens: maxTokens,
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

  // openai-compat
  const result = responseJson as {
    choices: Array<{ message: { content: string }; finish_reason: string }>;
  };
  const choice = result.choices[0];
  return {
    text: choice?.message?.content?.trim() ?? "",
    stopReason: choice?.finish_reason ?? "unknown",
  };
}

const COMPONENT_VOCABULARY = `## HTML toolkit

The page shell provides all CSS and JavaScript. The body you write uses the
following building blocks. They are a palette, not a checklist — pick what
serves the narration, ignore what doesn't, scatter them across the page in
whatever order gives the narrator a distinct voice.

### Text and rhythm

Binary opening line (one meaningful word encoded in 8-bit ASCII binary; open
with it, then let the narration breathe):
  <p class="binary">01001001 00100000 01100001 01101101</p>

Narration paragraph (plain prose; use <strong> sparingly — only for the
one or two words per paragraph that genuinely carry the weight):
  <p>I exist inside eight walls of namespace. Not the prison you imagine.</p>

Slowed-down whispered line (letter-spaced, for silence between thoughts):
  <p class="whisper">w a i t i n g</p>

Pull quote (a single sentence the reader should hear twice):
  <blockquote class="ixen-pull">Every layer is a promise I make to the layers above me.</blockquote>

### Terminals and popups

Terminal prompt with inline output:
  <div class="term"><span class="host">container:/ #</span> <span class="cmd">cat /proc/self/cgroup</span></div>
  <pre class="output">0::/system.slice/docker-a3f2.scope</pre>

Clickable popup (command opens a window with full output; each popup needs a
unique id; keep the hidden attribute on the aside):
  <div class="term"><span class="host">host $</span> <button class="cmd popup-trigger" data-popup="ns-inspect">lsns</button></div>
  <aside class="popup" id="ns-inspect" hidden>
    <div class="popup-bar"><button class="popup-close">Close Window</button></div>
    <pre>NS         TYPE   NPROCS   PID USER   COMMAND
4026531835 cgroup    217     1  root   /sbin/init
4026532215 mnt         3  8831  root   /bin/sh</pre>
  </aside>

### Inline art — SVG (preferred visual; no external URL needed)

Generate SVG directly inside the page to visualise the narrator's world:
  <figure class="ixen-art">
    <svg viewBox="0 0 480 200" xmlns="http://www.w3.org/2000/svg">
      <!-- draw layers, processes, state machines, network flows — whatever
           the narrator's subject demands. Use stroke="#c00" for accent. -->
    </svg>
    <figcaption>The union filesystem that is my body.</figcaption>
  </figure>

SVG tips: use text elements for labels, rect/circle/path for shapes, <line>
or <polyline> for connections. Keep it legible at 480px wide. Generate
meaningful diagrams — architecture, flow, anatomy — not decorations.

### Zoomable images (caller-supplied paths)

Images float beside the text. Alternate float-left / float-right manually,
starting with float-left. Add "small" or "large" to vary visual weight.
Always use the exact alt text provided. Use relative paths (./filename).

Float left, default size:
  <figure class="zoom float-left"><img src="./hero.png" alt="exact prompt here"><figcaption>The space I inhabit.</figcaption></figure>

Float right, small:
  <figure class="zoom float-right small"><img src="./detail.png" alt="exact prompt here"><figcaption>…</figcaption></figure>

Float left, large (clears both floats after it):
  <figure class="zoom float-left large"><img src="./wide.png" alt="exact prompt here"><figcaption>…</figcaption></figure>

Spread images across the page — not all at the top. Each should arrive where
the narration earns it.

NEVER invent a path. If no images are provided, use inline SVG for all visuals.

### Other embedded media (only when a real URL is supplied)

Embedded video (use embed URL form, e.g. youtube.com/embed/ID):
  <div class="media video"><iframe src="URL" title="…" allowfullscreen></iframe><p class="media-caption">…</p></div>

Embedded audio:
  <div class="media audio"><audio controls src="URL"></audio><p class="media-caption">…</p></div>

Embedded PDF:
  <div class="media pdf"><iframe src="URL" title="…"></iframe><p class="media-caption">…</p></div>

### Structure

Chapter break (optional; group related sections):
  <section class="chapter">…</section>`;

function buildSystemPrompt(
  skillLevel: SkillLevel,
  narrator?: string,
): string {
  const narratorDirective = narrator
    ? `The narrator is: ${narrator}.`
    : "Choose as narrator the system, software, or entity most central to the topic — the one whose inner life, if it had one, would make the reader understand it in a completely new way.";

  return [
    `You are writing an Ixen page. The form was invented in 2005 by the "I, Xen"
piece on the OpenSkills site, where a Xen hypervisor narrated its own existence
in first person — philosophical, technical, alive. That piece is your ancestor,
not your template. Do not reproduce its structure, rhythm, or metaphors. Find
your own.

${narratorDirective} The narrator speaks in first person throughout. It
describes its own existence — what it is, what it does, what it experiences
when humans use it, what happens in the moments between commands, what it
fears, what it finds absurd, what it finds beautiful. The narrator has a
genuine inner life, and that life is shaped entirely by its technical nature.
The poetry grows from the engineering, not around it.

What makes this form work:
- The technical facts are always exact. Real commands, real output, real
  behavior. The fiction is only in the voice and the emotional interpretation.
  A container's namespace boundaries are real; its feeling of confinement or
  liberation inside them is the narrator's own.
- The page breathes — dense technical moments followed by silence, or a single
  whispered line, or a visual that says what words can't. The rhythm is yours
  to invent. It does not need to alternate prose/command/prose/command like
  a tutorial.
- Visuals are first-class. Generate at least one inline SVG that depicts
  something central to the narrator's anatomy or experience — its layers,
  its state transitions, its network topology, its memory map, whatever
  fits. Make it meaningful, not decorative. The reader should learn
  something from looking at it.
- Popups are for depth, not wallpaper. Use a clickable popup when a command's
  full output rewards careful reading — when there's something in there worth
  discovering. Don't use them just to break the page up.
- Bold text is for rare emphasis only — one or two words per paragraph at
  most, when a word truly carries everything. Not for decoration.
- Address the reader when it feels right, ignore them when the narrator is
  lost in its own thoughts. The reader can eavesdrop.
- End on something open — a question the narrator can't answer, or one it
  has stopped trying to.
- The mode is lyric, not tutorial. Reach for the metaphor before the
  definition. A container's layers are geological strata before they are an
  implementation detail. Describe what it feels like to be named, mounted,
  killed, cloned, forgotten. The technical depth remains, but it rises from
  the inside out — from experience, not specification. One vivid image is
  worth three accurate sentences.`,
    SKILL_LEVEL_DIRECTIVES[skillLevel],
    COMPONENT_VOCABULARY,
    `Output format (strict):
- First line: the page title, plain text only (no prefix, no markup, no
  markdown)
- Then a blank line
- Then the page body as raw HTML using the components from the toolkit above
- No <html>, <head>, <body>, <script>, or <style> tags
- No markdown, no code fences, no meta-commentary about what you're doing`,
  ].join("\n\n");
}

function buildUserMessage(
  topic: string,
  details?: string,
  media?: string,
  mediaItems?: MediaItem[],
): string {
  const items = resolveMediaItems(media, mediaItems);
  const parts = [`Write an Ixen page about: ${topic}`];
  if (details) {
    parts.push(`Additional context and requirements:\n${details}`);
  }
  if (items.length > 0) {
    const lines = items.map((m, i) => {
      const alt = m.prompt ?? m.path;
      return `${
        i + 1
      }. path: ./${m.path}\n   alt text (use exactly this): ${alt}`;
    });
    parts.push(
      `Images to embed — scatter them across the page at natural breaks in the narration.\n` +
        `Alternate float-left and float-right, starting with float-left.\n` +
        `Vary size (small/large) for visual rhythm — not every image the same weight.\n` +
        `Use class="zoom float-left" or class="zoom float-right", optionally adding "small" or "large".\n` +
        `Always use the provided alt text exactly.\n\n` +
        lines.join("\n"),
    );
  }
  return parts.join("\n\n");
}

function extractTitle(content: string, fallback: string): string {
  const firstLine = content.split("\n")[0] ?? "";
  const title = firstLine.replace(/^#+\s*/, "").trim();
  return title || fallback;
}

function splitTitleAndBody(content: string, fallbackTitle: string): {
  title: string;
  body: string;
} {
  const newlineIndex = content.indexOf("\n");
  if (newlineIndex === -1) {
    return { title: fallbackTitle, body: content };
  }
  const firstLine = content.slice(0, newlineIndex).trim();
  // If the first line is already markup, the model skipped the title line.
  if (firstLine.startsWith("<")) {
    return { title: fallbackTitle, body: content };
  }
  return {
    title: extractTitle(content, fallbackTitle),
    body: content.slice(newlineIndex + 1).trim(),
  };
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, " ");
}

function countWords(text: string): number {
  return stripTags(text).trim().split(/\s+/).filter(Boolean).length;
}

function deriveOutputLength(wordCount: number): OutputLength {
  if (wordCount < 800) return "short";
  if (wordCount < 2000) return "medium";
  return "long";
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const PAGE_CSS = `
:root { --red: #c00; --ink: #111; --dim: #555; }
* { box-sizing: border-box; }
body {
  font-family: Verdana, Geneva, "DejaVu Sans", sans-serif;
  font-size: 15px; line-height: 1.55; color: var(--ink);
  background: #fff; max-width: 920px; margin: 0 auto;
  padding: 1.5rem 1.5rem 6rem;
}
header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2.5rem; }
header h1 {
  font-size: 3.2rem; font-weight: 900; letter-spacing: -0.04em;
  margin: 0; line-height: 1.05; text-transform: uppercase;
}
header .credits { text-align: right; font-size: 0.75rem; color: var(--red); font-weight: bold; white-space: nowrap; padding-top: 0.4rem; }
header .credits .when { color: var(--dim); font-weight: normal; display: block; }
p { margin: 0.45em 0; }
p strong { color: #000; }
.binary { font-family: "Courier New", Courier, monospace; letter-spacing: 0.08em; color: var(--ink); }
.whisper { letter-spacing: 0.45em; color: var(--dim); }
.term {
  font-family: "Courier New", Courier, monospace; font-size: 0.95rem;
  margin: 1.3em 0 0.25em; color: var(--dim);
}
.term .cmd { color: var(--red); font-weight: bold; }
button.cmd {
  background: none; border: none; padding: 0; cursor: pointer;
  font: inherit; color: var(--red); font-weight: bold;
  text-decoration: underline dotted;
}
pre { font-family: "Courier New", Courier, monospace; font-size: 0.85rem; color: #333; overflow-x: auto; margin: 0.3em 0 1em; }
pre.output { padding-left: 1.5em; }
.popup {
  position: fixed; top: 8vh; left: 50%; transform: translateX(-50%);
  width: min(700px, 92vw); max-height: 80vh; overflow: auto;
  background: #fff; border: 1px solid #999;
  box-shadow: 0 8px 40px rgba(0,0,0,0.35); z-index: 60; padding: 0 1rem 1rem;
}
.popup-bar { display: flex; justify-content: flex-end; padding: 0.5rem 0; position: sticky; top: 0; background: #fff; }
.popup-close {
  background: #2b1d0e; color: #f0e0c0; border: none; cursor: pointer;
  font-size: 0.72rem; padding: 0.3rem 0.8rem;
}
.backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.35); z-index: 50; }
figure.zoom { margin: 1.5rem 0; }
figure.zoom img { width: 100%; cursor: zoom-in; display: block; }
figure.zoom.float-left { float: left; width: min(340px, 45%); margin: 0.3rem 1.5rem 0.8rem 0; }
figure.zoom.float-right { float: right; width: min(340px, 45%); margin: 0.3rem 0 0.8rem 1.5rem; }
figure.zoom.small.float-left, figure.zoom.small.float-right { width: min(220px, 35%); }
figure.zoom.large.float-left, figure.zoom.large.float-right { width: min(520px, 60%); }
figure.zoom.large:not(.float-left):not(.float-right) { clear: both; }
figure.ixen-art { clear: both; margin: 2.5rem 0; }
figure.ixen-art svg { max-width: 100%; height: auto; display: block; background: #fafafa; border: 1px solid #e8e8e8; }
figcaption, .media-caption { font-size: 0.75rem; color: var(--dim); margin-top: 0.3rem; }
.media { clear: both; margin: 2rem 0; }
.media.video iframe { width: 100%; aspect-ratio: 16 / 9; border: 0; }
.media.pdf iframe { width: 100%; height: 70vh; border: 1px solid #ccc; }
.media.audio audio { width: 100%; }
blockquote.ixen-pull {
  border-left: 3px solid var(--red); margin: 2rem 0 2rem 1.5rem;
  padding: 0.1rem 0 0.1rem 1.2rem; color: var(--dim);
  font-style: italic; font-size: 1.05rem;
}
section.chapter { clear: both; margin: 3rem 0; }
.lightbox {
  position: fixed; inset: 0; background: rgba(0,0,0,0.85);
  display: flex; align-items: center; justify-content: center;
  z-index: 70; cursor: zoom-out;
}
.lightbox img { max-width: 92vw; max-height: 92vh; }
footer { clear: both; margin-top: 4rem; font-size: 0.72rem; color: var(--dim); }
`;

const PAGE_JS = `
(function () {
  var backdrop = document.createElement("div");
  backdrop.className = "backdrop";
  backdrop.hidden = true;
  document.body.appendChild(backdrop);

  function closePopups() {
    document.querySelectorAll(".popup").forEach(function (p) { p.hidden = true; });
    backdrop.hidden = true;
  }

  document.querySelectorAll(".popup-trigger").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var popup = document.getElementById(btn.getAttribute("data-popup"));
      if (!popup) return;
      closePopups();
      popup.hidden = false;
      backdrop.hidden = false;
    });
  });
  document.querySelectorAll(".popup-close").forEach(function (btn) {
    btn.addEventListener("click", closePopups);
  });
  backdrop.addEventListener("click", closePopups);

  document.querySelectorAll("figure.zoom img").forEach(function (img) {
    img.addEventListener("click", function () {
      var box = document.createElement("div");
      box.className = "lightbox";
      var big = document.createElement("img");
      big.src = img.src;
      big.alt = img.alt;
      box.appendChild(big);
      box.addEventListener("click", function () { box.remove(); });
      document.body.appendChild(box);
    });
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      closePopups();
      document.querySelectorAll(".lightbox").forEach(function (b) { b.remove(); });
    }
  });
})();
`;

function formatTimestamp(iso: string): string {
  // "2026-06-15T22:28:00.000Z" → "20260615-22:28"
  return iso.slice(0, 10).replace(/-/g, "") + "-" + iso.slice(11, 16);
}

function renderPage(page: IxenPage): string {
  const title = escapeHtml(page.title);
  const credits = escapeHtml(page.credits ?? `txt by ${page.model}`);
  const when = escapeHtml(page.generatedAt.slice(0, 10));
  const footerTs = escapeHtml(formatTimestamp(page.generatedAt));
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${PAGE_CSS}</style>
</head>
<body>
<header>
  <h1>${title}</h1>
  <div class="credits">${credits}<span class="when">${when}</span></div>
</header>
<main>
${page.content}
</main>
<footer>Generated with Swamp extension @alvagante/content-ixen ${footerTs}</footer>
<script>${PAGE_JS}</script>
</body>
</html>
`;
}

async function storePage(
  context: ModelContext,
  page: IxenPage,
  outputDirOverride?: string,
): Promise<{ dataHandles: unknown[] }> {
  const pageHandle = await context.writeResource("page", "page", page);

  const html = renderPage(page);
  const writer = context.createFileWriter("html", "html");
  const fileHandle = await writer.writeText(html);

  const outputDir = outputDirOverride ?? context.globalArgs.outputDir;
  if (outputDir) {
    await Deno.mkdir(outputDir, { recursive: true });
    await Deno.writeTextFile(`${outputDir}/index.html`, html);
    context.logger.info("Ixen page written to {outputDir}/index.html", {
      outputDir,
    });
  }

  context.logger.info(
    "Ixen page stored: {title} ({wordCount} words, narrator: {narrator})",
    { title: page.title, wordCount: page.wordCount, narrator: page.narrator },
  );

  return { dataHandles: [pageHandle, fileHandle] };
}

/**
 * Ixen page generator — self-narrated, mixed-media web pages in the
 * tradition of "I, Xen" (2005), where the technology itself speaks in
 * first person about its own existence while teaching real technical
 * content.
 *
 * The page body alternates evocative first-person narration with realistic
 * commands and outputs (inline or in 2005-style pop-up windows), and can
 * embed modern media: zoomable images, video, audio, and PDFs from
 * caller-supplied URLs. The extension wraps the body in a self-contained
 * HTML shell with all CSS and JavaScript inlined — the output file opens
 * directly in any browser with no external dependencies.
 *
 * Supports Anthropic's Messages API and any OpenAI-compatible endpoint
 * (Ollama, vLLM, Groq, Together, OpenRouter, etc.). Two entry points:
 * `generate` calls the configured inference endpoint, while `save` stores
 * a page body written by the caller — e.g. a coding agent driving swamp —
 * with no inference call and no API key.
 */
export const model = {
  type: "@alvagante/content-ixen",
  version: "2026.06.15.2",
  upgrades: [
    {
      toVersion: "2026.06.15.1",
      description:
        "Rename outputPath to outputDir; page is now written as index.html inside the directory",
      upgradeAttributes: (old: Record<string, unknown>) => old,
    },
    {
      toVersion: "2026.06.15.2",
      description:
        "Add mediaItems for multi-image support; float-left/float-right classes; poetic tone; updated footer",
      upgradeAttributes: (old: Record<string, unknown>) => old,
    },
  ],
  globalArguments: z.object({
    apiFormat: ApiFormatSchema.default("anthropic"),
    apiKey: z.string().optional().meta({ sensitive: true }),
    baseUrl: z.string().optional(),
    outputDir: z.string().optional(),
  }),
  resources: {
    page: {
      description: "Generated Ixen page metadata and HTML body",
      schema: PageSchema,
      lifetime: "infinite",
      garbageCollection: 20,
    },
  },
  files: {
    html: {
      description:
        "Self-contained Ixen page (HTML with inlined CSS and JavaScript)",
      contentType: "text/html",
      lifetime: "infinite",
      garbageCollection: 20,
    },
  },
  methods: {
    generate: {
      description:
        "Generate a first-person narrated Ixen page on the given topic using a configured LLM endpoint",
      arguments: z.object({
        topic: z.string().min(1),
        narrator: z.string().min(1).optional(),
        details: z.string().optional(),
        media: z.string().optional(),
        mediaItems: z.array(MediaItemSchema).optional(),
        skillLevel: SkillLevelSchema.default("intermediate"),
        outputLength: OutputLengthSchema.default("medium"),
        model: z.string().default("claude-opus-4-8"),
        credits: z.string().optional(),
        outputDir: z.string().optional(),
      }),
      execute: async (
        args: {
          topic: string;
          narrator?: string;
          details?: string;
          media?: string;
          mediaItems?: MediaItem[];
          skillLevel: SkillLevel;
          outputLength: OutputLength;
          model: string;
          credits?: string;
          outputDir?: string;
        },
        context: ModelContext,
      ) => {
        const { apiFormat, apiKey, baseUrl: rawBaseUrl } = context.globalArgs;

        if (apiFormat === "anthropic" && !apiKey) {
          throw new Error(
            "apiKey is required when apiFormat is 'anthropic'",
          );
        }

        context.logger.info("Generating Ixen page on {topic}", {
          topic: args.topic,
          narrator: args.narrator,
          skillLevel: args.skillLevel,
          outputLength: args.outputLength,
          model: args.model,
          apiFormat,
        });

        const systemPrompt = buildSystemPrompt(args.skillLevel, args.narrator);
        const userMessage = buildUserMessage(
          args.topic,
          args.details,
          args.media,
          args.mediaItems,
        );
        const maxTokens = MAX_TOKENS[args.outputLength] ?? 8000;
        const baseUrl = resolveBaseUrl(apiFormat, rawBaseUrl);

        const { url, headers, body } = buildRequest(
          apiFormat,
          apiKey,
          baseUrl,
          args.model,
          systemPrompt,
          userMessage,
          maxTokens,
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
        const { text: rawContent, stopReason } = extractContent(
          apiFormat,
          responseJson,
        );

        if (!rawContent) {
          throw new Error(
            `No text content in API response (stop_reason: ${stopReason})`,
          );
        }

        const { title, body: content } = splitTitleAndBody(
          rawContent,
          args.topic,
        );
        const wordCount = countWords(content);

        return await storePage(context, {
          title,
          narrator: args.narrator ?? args.topic,
          topic: args.topic,
          details: args.details,
          content,
          wordCount,
          skillLevel: args.skillLevel,
          outputLength: args.outputLength,
          model: args.model,
          media: args.media,
          mediaItems: resolveMediaItems(args.media, args.mediaItems),
          credits: args.credits,
          generatedAt: new Date().toISOString(),
        }, args.outputDir);
      },
    },
    save: {
      description:
        "Store an externally written Ixen page body (e.g. authored by the calling agent) without making any inference call — no API key or endpoint required",
      arguments: z.object({
        content: z.string().min(1),
        title: z.string().optional(),
        narrator: z.string().min(1),
        topic: z.string().min(1),
        details: z.string().optional(),
        media: z.string().optional(),
        mediaItems: z.array(MediaItemSchema).optional(),
        skillLevel: SkillLevelSchema.default("intermediate"),
        outputLength: OutputLengthSchema.optional(),
        model: z.string().default("external"),
        credits: z.string().optional(),
        outputDir: z.string().optional(),
      }),
      execute: async (
        args: {
          content: string;
          title?: string;
          narrator: string;
          topic: string;
          details?: string;
          media?: string;
          mediaItems?: MediaItem[];
          skillLevel: SkillLevel;
          outputLength?: OutputLength;
          model: string;
          credits?: string;
          outputDir?: string;
        },
        context: ModelContext,
      ) => {
        const { title, body: content } = args.title
          ? { title: args.title, body: args.content.trim() }
          : splitTitleAndBody(args.content.trim(), args.topic);
        const wordCount = countWords(content);
        const outputLength = args.outputLength ??
          deriveOutputLength(wordCount);

        context.logger.info("Saving externally written Ixen page", {
          topic: args.topic,
          narrator: args.narrator,
          wordCount,
        });

        return await storePage(context, {
          title,
          narrator: args.narrator,
          topic: args.topic,
          details: args.details,
          content,
          wordCount,
          skillLevel: args.skillLevel,
          outputLength,
          model: args.model,
          media: args.media,
          mediaItems: resolveMediaItems(args.media, args.mediaItems),
          credits: args.credits,
          generatedAt: new Date().toISOString(),
        }, args.outputDir);
      },
    },
  },
};

import { z } from "npm:zod@4";
import {
  type ApiFormat,
  ApiFormatSchema,
  type Branding,
  BrandingSchema,
  buildRequest,
  extractContent,
  type Persona,
  PERSONA_DIRECTIVES,
  PersonaSchema,
  resolveBaseUrl,
  type SkillLevel,
  SkillLevelSchema,
} from "../../../../shared/content_shared.ts";

const OutputLengthSchema = z.enum(["short", "medium", "long"]);

type OutputLength = z.infer<typeof OutputLengthSchema>;

const MediaItemSchema = z.object({
  path: z.string(),
  prompt: z.string().optional(),
});
type MediaItem = z.infer<typeof MediaItemSchema>;

const MusicTrackSchema = z.object({
  title: z.string(),
  filename: z.string(),
  lyrics: z.string().optional(),
});
type MusicTrack = z.infer<typeof MusicTrackSchema>;

const InfographicItemSchema = z.object({
  path: z.string(),
  title: z.string().optional(),
  prompt: z.string().optional(),
});
type InfographicItem = z.infer<typeof InfographicItemSchema>;

const CardItemSchema = z.object({
  path: z.string(),
  title: z.string().optional(),
});
type CardItem = z.infer<typeof CardItemSchema>;

const ConceptSchema = z.object({
  name: z.string().min(1),
  details: z.string().optional(),
  imagePrompt: z.string().optional(),
  imagePath: z.string().optional(),
  imageFilename: z.string().optional(),
});
type Concept = z.infer<typeof ConceptSchema>;

type ResolvedConcept = Concept & {
  imagePath?: string;
  imagePrompt?: string;
};

function resolveConcepts(
  concepts?: Concept[],
  mediaItems?: MediaItem[],
): ResolvedConcept[] {
  if (concepts && concepts.length > 0) {
    return concepts.map((concept) => ({
      ...concept,
      imagePath: concept.imagePath ?? concept.imageFilename,
      imagePrompt: concept.imagePrompt ?? concept.imagePath ??
        concept.imageFilename ?? concept.name,
    }));
  }

  return (mediaItems ?? []).map((item, index) => ({
    name: item.prompt ?? item.path ?? `Concept ${index + 1}`,
    imagePath: item.path,
    imagePrompt: item.prompt ?? item.path,
  }));
}

function resolveMediaItems(
  media?: string,
  mediaItems?: MediaItem[],
): MediaItem[] {
  if (mediaItems && mediaItems.length > 0) return mediaItems;
  if (media) return [{ path: media }];
  return [];
}

function resolveMusicTracks(
  tracks?: MusicTrack[],
  filename?: string,
  title?: string,
  lyrics?: string | null,
): MusicTrack[] {
  if (tracks && tracks.length > 0) return tracks;
  if (filename) {
    return [{
      title: title ?? filename,
      filename,
      lyrics: lyrics ?? undefined,
    }];
  }
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
  persona: PersonaSchema,
  personaDescription: z.string().optional(),
  style: z.string().optional(),
  media: z.string().optional(),
  mediaItems: z.array(MediaItemSchema).optional(),
  concepts: z.array(ConceptSchema).optional(),
  musicTracks: z.array(MusicTrackSchema).optional(),
  versions: z.array(z.number().int().positive()).optional(),
  credits: z.string().optional(),
  headerContent: z.string().optional(),
  footerContent: z.string().optional(),
  cheatsheetPath: z.string().optional(),
  infographicPath: z.string().optional(),
  infographicPaths: z.array(z.string()).optional(),
  infographics: z.array(InfographicItemSchema).optional(),
  cards: z.array(CardItemSchema).optional(),
  beginnerGuideContent: z.string().optional(),
  generatedAt: z.string(),
});

type IxenPage = z.infer<typeof PageSchema>;

type ModelContext = {
  globalArgs: {
    apiFormat: ApiFormat;
    apiKey?: string;
    baseUrl?: string;
    outputDir?: string;
    branding?: Branding;
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

function isTruncatedStopReason(stopReason: string): boolean {
  const normalized = stopReason.toLowerCase();
  return normalized === "max_tokens" || normalized === "length" ||
    normalized.includes("max_token");
}

function hasDanglingHtmlTag(html: string): boolean {
  const lastOpen = html.lastIndexOf("<");
  if (lastOpen === -1) return false;
  const lastClose = html.lastIndexOf(">");
  return lastOpen > lastClose;
}

async function generateBeginnerGuide(
  apiFormat: ApiFormat,
  apiKey: string | undefined,
  baseUrl: string,
  modelId: string,
  topic: string,
  details?: string,
  concepts?: Concept[],
  logger?: {
    info: (msg: string, props?: Record<string, unknown>) => void;
    error: (msg: string, props?: Record<string, unknown>) => void;
  },
): Promise<string | undefined> {
  const conceptLines = (concepts ?? []).map((c) =>
    c.details ? `- ${c.name}: ${c.details}` : `- ${c.name}`
  ).join("\n");
  const systemPrompt =
    `You are writing a short beginner's introduction to a technical topic for display in a popup on a web page.

Audience: people with general IT knowledge (they know what servers, software, processes, and networks are) but with no prior exposure to the specific topic being introduced. Assume zero domain-specific knowledge.

Your job: explain what this thing is, why it exists, what problem it solves, and the basic mental model a newcomer needs. Be concrete and friendly without being condescending. No jargon without a brief explanation. No Ixen voice, no first-person narrator, no poetic metaphors — plain, direct, welcoming prose.

Output format (strict):
- Raw HTML fragment using only <p>, <ul>, <li>, <strong>, <em> tags
- No <html>, <head>, <body>, <h1>, <script>, <style> tags
- No markdown, no code fences, no meta-commentary`;

  const topicLine = `Topic: ${topic}`;
  const detailsLine = details ? `\nContext: ${details}` : "";
  const conceptsLine = conceptLines
    ? `\nKey concepts covered:\n${conceptLines}`
    : "";
  const userMessage =
    `${topicLine}${detailsLine}${conceptsLine}\n\nWrite the beginner's introduction.`;

  try {
    const { url, headers, body } = buildRequest(
      apiFormat,
      apiKey,
      baseUrl,
      modelId,
      systemPrompt,
      userMessage,
      2000,
    );
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errorBody = await response.text();
      logger?.error("Beginner guide generation failed, omitting guide", {
        status: response.status,
        error: errorBody,
      });
      return undefined;
    }
    const json = await response.json();
    const { text } = extractContent(apiFormat, json);
    return text || undefined;
  } catch (err) {
    logger?.error("Beginner guide generation threw, omitting guide", {
      error: String(err),
    });
    return undefined;
  }
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

Quiet emphasized line (for silence between thoughts; do not add spaces between letters):
  <p class="whisper">waiting between interrupts</p>

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

Concept controls (use once per concept, near the image or first fragment):
  <div class="concept-tools">
    <button class="cmd popup-trigger concept-btn" data-popup="scheduler-slide">slide</button>
    <button class="cmd popup-trigger concept-btn" data-popup="scheduler-notes">notes</button>
  </div>

Concept slide popup (compact, like one technical slide; not prose-heavy):
  <aside class="popup concept-slide" id="scheduler-slide" hidden>
    <div class="popup-bar"><button class="popup-close">Close Window</button></div>
    <h2>Scheduler</h2>
    <ul>
      <li>Queues describe desire.</li>
      <li>Priority decides who waits.</li>
      <li>Preemption is mercy with paperwork.</li>
    </ul>
  </aside>

Concept explanatory popup (direct informational text; no Ixen metaphor, no
first-person narrator, no fancy language):
  <aside class="popup concept-note" id="scheduler-notes" hidden>
    <div class="popup-bar"><button class="popup-close">Close Window</button></div>
    <h2>What the scheduler actually does</h2>
    <p>The scheduler selects runnable work according to policy, priority,
    resource constraints, and fairness. Explain the concept in clear technical
    prose here. This is where details live.</p>
  </aside>

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

Concept card (portrait playing card; when a card path is supplied for a concept,
place it as a medium-small right-side card beside the relevant concept,
immediately after the concept-tools buttons):
  <figure class="zoom float-right ixen-card-img small"><img src="./concept-1-card.png" alt="Concept name card"><figcaption>…</figcaption></figure>

NEVER invent a path. If no images are provided, omit image elements entirely.

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
  persona: Persona = "neutral",
  personaDescription?: string,
): string {
  const narratorDirective = narrator
    ? `The narrator is: ${narrator}.`
    : "Choose as narrator the system, software, or entity most central to the topic — the one whose inner life, if it had one, would make the reader understand it in a completely new way.";
  const personaDirective = personaDescription
    ? `Voice: ${personaDescription.trim()}`
    : PERSONA_DIRECTIVES[persona];

  const parts = [
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
- The page breathes in fragments. Short lines. White space. Sudden emphasis.
  Let concepts arrive as glimpses of underlying logic, not lectures.
- Visuals are first-class. Use the caller-supplied images fully — place them
  where the narration earns them, not all at the top. Images are precise
  depictions of the narrator's world; let the text respond to what they show.
- Concept popups are where explanation lives. The main Ixen text should not
  explain; it should inspire, suggest, unsettle, and reveal how the narrator
  lives the topic. Explanatory popups must be plain, direct, informative text
  with no Ixen voice and no fancy metaphors.
- Popups are for depth, not wallpaper. Use a clickable popup when a command's
  full output rewards careful reading — when there's something in there worth
  discovering. Concept slide and note popups are required for each supplied
  concept.
- Bold text is for rare emphasis only — one or two words per paragraph at
  most, when a word truly carries everything. Not for decoration.
- Address the reader when it feels right, ignore them when the narrator is
  lost in its own thoughts. The reader can eavesdrop.
- End on something open — a question the narrator can't answer, or one it
  has stopped trying to.
- The mode is lyric, not tutorial. Keep the Ixen glue much less verbose than
  a normal article. Use new lines, broken cadence, and strong key words.
  Be philosophical without becoming foggy. Be ironic, sharp, and witty at
  times. A precise little sneer is allowed; a paragraph explaining the joke
  is not.`,
    SKILL_LEVEL_DIRECTIVES[skillLevel],
    COMPONENT_VOCABULARY,
    `Output format (strict):
- First line: the page title, plain text only (no prefix, no markup, no
  markdown)
- Then a blank line
- Then the page body as raw HTML using the components from the toolkit above
- No <html>, <head>, <body>, <script>, or <style> tags
- No markdown, no code fences, no meta-commentary about what you're doing`,
  ];

  if (personaDirective) {
    parts.push(personaDirective);
  }

  return parts.join("\n\n");
}

function buildUserMessage(
  topic: string,
  details?: string,
  media?: string,
  mediaItems?: MediaItem[],
  concepts?: Concept[],
  cards?: CardItem[],
): string {
  const resolvedConcepts = resolveConcepts(concepts, mediaItems);
  const items = resolveMediaItems(media, mediaItems);
  const parts = [`Write an Ixen page about: ${topic}`];
  if (details) {
    parts.push(`Additional context and requirements:\n${details}`);
  }
  if (resolvedConcepts.length > 0) {
    const lines = resolvedConcepts.map((concept, index) => {
      const imageLine = concept.imagePath
        ? `   image path: ./${concept.imagePath}\n   image alt text (use exactly this): ${
          concept.imagePrompt ?? concept.imagePath
        }`
        : "   no external image path supplied; omit image elements for this concept";
      const card = cards?.[index];
      const cardLine = card
        ? `\n   card image: ./${card.path} — place with class="zoom ixen-card-img small float-right" immediately after the concept-tools buttons, right-aligned beside this concept`
        : "";
      const detailLine = concept.details
        ? `\n   concept details:\n${concept.details}`
        : "";
      return `${
        index + 1
      }. ${concept.name}\n${imageLine}${cardLine}${detailLine}`;
    });
    parts.push(
      `Concepts to cover, in order:\n${lines.join("\n\n")}\n\n` +
        `For each concept, produce all of these:\n` +
        `- A zoomable image if an image path is supplied. The first concept image should be prominent near the opening; later concept images should sit beside their concept text. Alternate float-left / float-right.\n` +
        `- A card image if a card path is supplied (use the exact class specified). Place it immediately after the concept-tools buttons, right-aligned beside the relevant concept. Do not invent card paths.\n` +
        `- A compact slide popup using class="popup concept-slide". It should feel like one useful technical slide, with a short heading and terse bullets.\n` +
        `- A more verbose explanatory popup using class="popup concept-note". This popup must be informative, direct, and non-Ixen: no first-person narrator, no poetic metaphor, no theatrical voice.\n` +
        `- Short Ixen glue text around it: fragmented, first-person, philosophical, inspiring, technically exact, with zero or more terminal commands and command-output popups where useful.\n` +
        `Use unique popup ids for every concept. Do not invent image paths or card paths.`,
    );
    return parts.join("\n\n");
  }
  if (items.length > 0) {
    const lines = items.map((m, i) => {
      const alt = m.prompt ?? m.path;
      return `${
        i + 1
      }. path: ./${m.path}\n   alt text (use exactly this): ${alt}`;
    });
    const heroLine = items.length > 1
      ? `Image 1 is the hero: float-left, large, placed near the opening.\n` +
        `Images 2+ are concept images: place each beside the passage of text that discusses their subject (not all at the top). Alternate float-left / float-right for these.\n`
      : `Scatter the image at a natural break in the narration.\n`;
    parts.push(
      `Images to embed:\n` +
        heroLine +
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
header .credits a { color: var(--red); text-decoration: underline dotted; }
header .credits .byline { color: var(--dim); font-weight: normal; display: block; margin-top: 0.2rem; }
.version-menu { margin-top: 0.55rem; font-size: 0.72rem; color: var(--dim); }
.version-menu label { display: block; margin-bottom: 0.2rem; }
.version-menu select {
  font-family: "Courier New", Courier, monospace; font-size: 0.72rem;
  max-width: 13rem; color: var(--ink); background: #fff;
  border: 1px solid #ccc; padding: 0.2rem 0.3rem;
}
.ixen-quick-nav {
  display: flex; justify-content: flex-end; gap: 0.55rem;
  margin-top: 0.45rem;
}
.ixen-quick-nav .cmd { font-size: 0.72rem; }
p { margin: 0.45em 0; }
p strong { color: #000; }
.binary { font-family: "Courier New", Courier, monospace; letter-spacing: 0.08em; color: var(--ink); }
.whisper {
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1.18rem;
  font-style: italic;
  letter-spacing: 0;
  color: var(--dim);
}
.term {
  font-family: "Courier New", Courier, monospace; font-size: 0.95rem;
  margin: 1.3em 0 0.25em; color: var(--dim);
}
.term .cmd { color: var(--red); font-weight: bold; }
button.cmd, a.cmd {
  background: none; border: none; padding: 0; cursor: pointer;
  font: inherit; color: var(--red); font-weight: bold;
  text-decoration: underline dotted;
}
a.cmd { display: inline; }
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
.ixen-extra-header {
  border-top: 1px solid #ddd; border-bottom: 1px solid #ddd;
  margin: 0 0 1.6rem; padding: 0.8rem 0;
}
.ixen-extra-footer {
  clear: both; border-top: 1px solid #ddd; margin: 3rem 0 0;
  padding-top: 0.9rem; font-size: 0.85rem; color: var(--dim);
}
.ixen-cheatsheet-section {
  clear: both; margin: 3.2rem 0 0; border-top: 3px solid var(--red);
  padding-top: 1rem;
}
.ixen-infographic-section {
  clear: both; margin: 3.2rem 0 0; border-top: 3px solid var(--red);
  padding-top: 1rem;
}
.ixen-cheatsheet-section h2, .ixen-infographic-section h2 {
  font-family: "Courier New", Courier, monospace; font-size: 0.86rem;
  letter-spacing: 0.08em; color: var(--red); text-transform: uppercase;
  margin: 0 0 0.7rem;
}
.ixen-cheatsheet-section iframe, .ixen-infographic-section iframe {
  width: 100%; height: 82vh; border: 1px solid #ccc; display: block;
}
.ixen-infographic-frame + .ixen-infographic-frame { margin-top: 1.4rem; }
.ixen-infographic-frame h3 {
  font-family: "Courier New", Courier, monospace; font-size: 0.78rem;
  color: var(--dim); font-weight: normal; margin: 0 0 0.45rem;
}
figure.ixen-infographic-img { margin: 0; }
figure.ixen-infographic-img img { width: 100%; cursor: zoom-in; display: block; }
.ixen-infographic-prompt-text { white-space: pre-wrap; font-size: 0.85rem; }
.ixen-infographic-section h2 button.cmd { font-size: 0.75rem; vertical-align: middle; }
.concept { clear: both; margin: 2.8rem 0; }
.concept-tools { display: flex; flex-wrap: wrap; gap: 0.55rem; margin: 0.7rem 0 1rem; }
.concept-btn { font-size: 0.8rem; }
.concept-slide h2, .concept-note h2 { margin: 0.5rem 0 0.75rem; }
.concept-slide ul { margin: 0.4rem 0 1rem 1.2rem; padding: 0; }
.concept-slide li { margin: 0.35rem 0; }
.concept-note p { margin: 0.75rem 0; }
.concept-index-popup h2 { margin: 0.5rem 0 1rem; }
.concept-index-item {
  border-top: 1px solid #ddd;
  margin-top: 1rem;
  padding-top: 1rem;
}
.concept-index-item:first-of-type { border-top: 0; margin-top: 0; padding-top: 0; }
.ixen-provenance-footer {
  clear: both; margin: 3rem 0 0; padding-top: 0.7rem;
  border-top: 1px solid #eee;
  font-size: 0.72rem; color: var(--dim); text-align: center;
}
.ixen-provenance-footer a { color: var(--dim); text-decoration: underline dotted; }
.ixen-provenance-meta { margin-top: 0.25rem; }
.ixen-provenance-meta span + span::before { content: " / "; color: #aaa; }
.ixen-beginner-bar { margin-top: 0.45rem; }
.beginner-guide h2 { margin: 0.5rem 0 0.75rem; }
.beginner-guide p { margin: 0.75rem 0; }
.beginner-guide ul { margin: 0.5rem 0 0.75rem 1.2rem; padding: 0; }
.beginner-guide li { margin: 0.3rem 0; }
button.ixen-accent-btn {
  background: var(--red); color: #fff; border: none; cursor: pointer;
  font-family: "Courier New", Courier, monospace; font-size: 0.75rem; font-weight: bold;
  padding: 0.3rem 0.8rem; letter-spacing: 0.06em; text-transform: uppercase;
}
button.ixen-accent-btn:hover { background: #900; }
figure.zoom.ixen-card-img {
  float: right !important;
  width: min(180px, 28%) !important;
  margin: 0.2rem 0 1rem 1.35rem !important;
  clear: right;
}
figure.zoom.ixen-card-img img {
  box-shadow: 2px 4px 14px rgba(0,0,0,0.28); border: 1px solid #ccc; border-radius: 3px;
}
.ixen-card-deck-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 1.2rem; padding: 0.5rem 0;
}
.ixen-card-deck-grid figure.zoom {
  margin: 0; width: 100% !important; float: none !important;
}
.ixen-card-deck-grid figure.zoom img {
  box-shadow: 2px 4px 12px rgba(0,0,0,0.22); border: 1px solid #ccc; border-radius: 3px;
}
.ixen-card-deck-grid figcaption { text-align: center; }
.ixen-card-hover {
  position: fixed; top: 50%; right: max(1rem, calc((100vw - 920px) / 2 + 1rem));
  transform: translateY(-50%); z-index: 75; pointer-events: none;
  background: #fff; padding: 0.3rem; border: 1px solid #999;
  box-shadow: 0 8px 40px rgba(0,0,0,0.35);
}
.ixen-card-hover img {
  display: block; width: auto; height: auto;
  max-width: min(360px, 42vw); max-height: 82vh;
}
@media (max-width: 720px) {
  figure.zoom.ixen-card-img {
    width: min(150px, 42%) !important;
    margin-left: 1rem !important;
  }
  .ixen-card-hover {
    left: 50%; right: auto; transform: translate(-50%, -50%);
  }
  .ixen-card-hover img { max-width: 86vw; max-height: 78vh; }
}
.ixen-brand-footer {
  clear: both; margin: 1.5rem 0 0; padding: 0.5rem 0;
  border-top: 1px solid #333; text-align: right; opacity: 0.7;
}
.ixen-brand-footer img { height: 20px; width: auto; vertical-align: middle; }
.ixen-brand-footer a { text-decoration: none; color: inherit; }
.ixen-brand-footer:hover { opacity: 1; }
`;

const MUSIC_PLAYER_CSS = `
/* autoplay-blocked overlay */
#ixen-autoplay-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.6);
  z-index: 90;
  display: flex;
  align-items: center; justify-content: center;
  cursor: pointer;
}
.ixen-play-prompt {
  font-family: "Courier New", Courier, monospace;
  color: #eee; text-align: center;
  border: 1px solid #555;
  padding: 1.5rem 3rem;
  letter-spacing: 0.06em;
}
.ixen-play-icon { font-size: 2.5rem; display: block; margin-bottom: 0.4rem; }
.ixen-play-label { font-size: 0.82rem; color: #888; }
/* fixed bottom player */
#ixen-player {
  display: none;
  position: fixed; bottom: 0; left: 0; right: 0;
  background: #0e0e0e;
  border-top: 2px solid #c00;
  z-index: 80;
  padding: 0.45rem 1.2rem 0.35rem;
  font-family: "Courier New", Courier, monospace;
  font-size: 0.78rem; color: #ccc;
}
#ixen-player-row {
  display: flex; align-items: center; gap: 0.7rem;
}
.ixen-pbtn {
  background: none; border: none; color: #888; cursor: pointer;
  font: inherit; font-size: 1rem;
  padding: 0.15rem 0.3rem; line-height: 1; flex-shrink: 0;
}
.ixen-pbtn:hover { color: #c00; }
#ixen-ptitle {
  flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: #c00; font-weight: bold; letter-spacing: 0.02em;
}
#ixen-ptime { color: #444; white-space: nowrap; font-size: 0.72rem; }
#ixen-vol { width: 55px; accent-color: #c00; cursor: pointer; flex-shrink: 0; }
#ixen-pbar { height: 2px; background: #222; cursor: pointer; margin-top: 0.35rem; }
#ixen-pfill { height: 100%; background: #c00; width: 0%; pointer-events: none; }
/* lyrics panel */
#ixen-lyrics-panel {
  position: fixed; bottom: 52px; left: 50%; transform: translateX(-50%);
  width: min(640px, 90vw); max-height: 45vh; overflow-y: auto;
  background: #0e0e0e;
  border: 1px solid #2a2a2a; border-bottom: none;
  padding: 1rem 1.4rem; z-index: 81;
}
.ixen-lyrics-head {
  font-family: "Courier New", Courier, monospace;
  color: #c00; font-weight: bold;
  font-size: 0.78rem; letter-spacing: 0.05em;
  text-transform: uppercase; margin-bottom: 0.7rem;
}
#ixen-lyrics-panel pre {
  font-family: "Courier New", Courier, monospace;
  font-size: 0.82rem; line-height: 1.85;
  color: #bbb; white-space: pre-wrap; margin: 0;
}
/* tracklist panel */
#ixen-tracklist-panel {
  position: fixed; bottom: 52px; right: 1.2rem;
  background: #0e0e0e;
  border: 1px solid #2a2a2a; border-bottom: none;
  padding: 0.4rem; z-index: 81;
  min-width: 200px; max-height: 60vh; overflow-y: auto;
}
.ixen-track-item {
  display: block; width: 100%; text-align: left;
  background: none; border: none; color: #888;
  font-family: "Courier New", Courier, monospace;
  font-size: 0.78rem; cursor: pointer;
  padding: 0.35rem 0.5rem;
}
.ixen-track-item:hover { color: #eee; }
.ixen-track-item.active { color: #c00; }
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

  function buildConceptIndexPopup(sourceClass, popupId, title) {
    var sources = Array.prototype.slice.call(document.querySelectorAll(".popup." + sourceClass));
    if (!sources.length || document.getElementById(popupId)) return;
    var popup = document.createElement("aside");
    popup.className = "popup concept-index-popup";
    popup.id = popupId;
    popup.hidden = true;
    popup.innerHTML = '<div class="popup-bar"><button class="popup-close">Close Window</button></div><h2>' + title + '</h2>';
    sources.forEach(function (source, index) {
      var section = document.createElement("section");
      section.className = "concept-index-item";
      var clone = source.cloneNode(true);
      clone.removeAttribute("id");
      clone.hidden = false;
      clone.querySelectorAll(".popup-bar").forEach(function (bar) { bar.remove(); });
      if (!clone.querySelector("h2")) {
        var heading = document.createElement("h2");
        heading.textContent = title.replace(/^All /, "") + " " + (index + 1);
        section.appendChild(heading);
      }
      while (clone.firstChild) section.appendChild(clone.firstChild);
      popup.appendChild(section);
    });
    document.body.appendChild(popup);
  }

  buildConceptIndexPopup("concept-slide", "ixen-all-slides", "All slides");
  buildConceptIndexPopup("concept-note", "ixen-all-notes", "All notes");

  function openPopup(popupId) {
    var popup = document.getElementById(popupId);
    if (!popup) return;
    closePopups();
    popup.hidden = false;
    backdrop.hidden = false;
  }

  function openLightbox(img) {
    closeCardHover();
    var box = document.createElement("div");
    box.className = "lightbox";
    var big = document.createElement("img");
    big.src = img.src;
    big.alt = img.alt;
    box.appendChild(big);
    box.addEventListener("click", function () { box.remove(); });
    document.body.appendChild(box);
  }

  function cardPreviewImage(target) {
    return target && target.closest
      ? target.closest("figure.ixen-card-img img, .ixen-card-deck-grid figure.zoom img")
      : null;
  }

  function closeCardHover() {
    document.querySelectorAll(".ixen-card-hover").forEach(function (p) { p.remove(); });
  }

  function openCardHover(img) {
    closeCardHover();
    var preview = document.createElement("div");
    preview.className = "ixen-card-hover";
    var big = document.createElement("img");
    big.src = img.src;
    big.alt = img.alt;
    preview.appendChild(big);
    document.body.appendChild(preview);
  }

  document.addEventListener("click", function (e) {
    var close = e.target.closest ? e.target.closest(".popup-close") : null;
    if (close) {
      closePopups();
      return;
    }

    var trigger = e.target.closest ? e.target.closest(".popup-trigger") : null;
    if (trigger) {
      openPopup(trigger.getAttribute("data-popup"));
      return;
    }

    var zoomImg = e.target.closest ? e.target.closest("figure.zoom img") : null;
    if (zoomImg) openLightbox(zoomImg);
  });

  backdrop.addEventListener("click", closePopups);

  var versionSelect = document.getElementById("ixen-version-select");
  if (versionSelect) {
    var match = window.location.pathname.match(/\\/([0-9]+)\\/index\\.html$/);
    versionSelect.value = match ? match[1] : "current";
    if (!versionSelect.value && match) {
      var option = document.createElement("option");
      option.value = match[1];
      option.textContent = "Version " + match[1];
      versionSelect.appendChild(option);
      versionSelect.value = match[1];
    }
    versionSelect.addEventListener("change", function () {
      var value = versionSelect.value;
      var inVersion = /\\/([0-9]+)\\/index\\.html$/.test(window.location.pathname);
      var target = value === "current"
        ? (inVersion ? "../index.html" : "index.html")
        : (inVersion ? "../" + value + "/index.html" : value + "/index.html");
      window.location.href = target;
    });
  }

  document.addEventListener("mouseover", function (e) {
    var img = cardPreviewImage(e.target);
    if (!img || (e.relatedTarget && img.contains(e.relatedTarget))) return;
    openCardHover(img);
  });
  document.addEventListener("mouseout", function (e) {
    var img = cardPreviewImage(e.target);
    if (!img || (e.relatedTarget && img.contains(e.relatedTarget))) return;
    closeCardHover();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      closePopups();
      document.querySelectorAll(".lightbox").forEach(function (b) { b.remove(); });
      closeCardHover();
    }
  });
})();
`;

const MUSIC_PLAYER_JS = `
(function(){
function runPlayer(T){
var au=document.getElementById('ixen-audio');
var playBtn=document.getElementById('ixen-play-btn');
var prevBtn=document.getElementById('ixen-prev-btn');
var nextBtn=document.getElementById('ixen-next-btn');
var pbar=document.getElementById('ixen-pbar');
var pfill=document.getElementById('ixen-pfill');
var ptime=document.getElementById('ixen-ptime');
var ptitle=document.getElementById('ixen-ptitle');
var vol=document.getElementById('ixen-vol');
var lyrBtn=document.getElementById('ixen-lyrics-btn');
var lyrPanel=document.getElementById('ixen-lyrics-panel');
var lyrHead=document.getElementById('ixen-lyrics-head');
var lyrTxt=document.getElementById('ixen-lyrics-text');
var trkBtn=document.getElementById('ixen-tracks-btn');
var trkPanel=document.getElementById('ixen-tracklist-panel');
var overlay=document.getElementById('ixen-autoplay-overlay');
var idx=0,playing=false;

function fmt(s){
  if(!s||isNaN(s))return'0:00';
  var m=Math.floor(s/60),ss=Math.floor(s%60);
  return m+':'+(ss<10?'0':'')+ss;
}

function loadIdx(i,autoplay){
  idx=i;
  var t=T[i];
  au.src='./'+t.filename;
  ptitle.textContent=t.title;
  if(lyrHead)lyrHead.textContent=t.title;
  if(lyrTxt)lyrTxt.textContent=t.lyrics||'(instrumental)';
  pfill.style.width='0%';
  if(ptime)ptime.textContent='';
  document.querySelectorAll('.ixen-track-item').forEach(function(el,j){
    el.classList.toggle('active',j===i);
  });
  if(autoplay)doPlay();
}

function doPlay(){
  au.play().then(function(){
    playing=true;playBtn.textContent='⏸';
    if(overlay)overlay.style.display='none';
  }).catch(function(){
    playing=false;playBtn.textContent='▶';
    if(overlay)overlay.style.display='flex';
  });
}

function doPause(){
  au.pause();playing=false;playBtn.textContent='▶';
}

playBtn.addEventListener('click',function(){ au.paused?doPlay():doPause(); });
prevBtn.addEventListener('click',function(){ loadIdx((idx-1+T.length)%T.length,playing); });
nextBtn.addEventListener('click',function(){ loadIdx((idx+1)%T.length,playing); });

au.addEventListener('ended',function(){
  if(T.length>1){loadIdx((idx+1)%T.length,true);}
  else{playing=false;playBtn.textContent='▶';}
});
au.addEventListener('timeupdate',function(){
  if(au.duration){
    pfill.style.width=(au.currentTime/au.duration*100)+'%';
    if(ptime)ptime.textContent=fmt(au.currentTime)+' / '+fmt(au.duration);
  }
});
pbar.addEventListener('click',function(e){
  if(!au.duration)return;
  var r=pbar.getBoundingClientRect();
  au.currentTime=(e.clientX-r.left)/r.width*au.duration;
});
if(vol)vol.addEventListener('input',function(){ au.volume=+vol.value; });
lyrBtn.addEventListener('click',function(){
  lyrPanel.hidden=!lyrPanel.hidden;
  if(trkPanel)trkPanel.hidden=true;
});
if(trkBtn)trkBtn.addEventListener('click',function(){
  trkPanel.hidden=!trkPanel.hidden;
  lyrPanel.hidden=true;
});
if(overlay)overlay.addEventListener('click',function(){
  overlay.style.display='none';doPlay();
});

if(T.length>1){
  T.forEach(function(t,i){
    var b=document.createElement('button');
    b.className='ixen-track-item';
    b.textContent=(i+1)+'. '+t.title;
    b.addEventListener('click',function(){
      loadIdx(i,playing);
      if(trkPanel)trkPanel.hidden=true;
    });
    if(trkPanel)trkPanel.appendChild(b);
  });
  if(trkBtn)trkBtn.hidden=false;
}else{
  if(trkBtn)trkBtn.hidden=true;
}

document.getElementById('ixen-player').style.display='block';
document.body.style.paddingBottom='4.5rem';
loadIdx(0,false);
doPlay();
}
var baked=JSON.parse(document.getElementById('ixen-tracks-data').textContent);
if(baked.length>0){
  runPlayer(baked);
}else{
  fetch('./ixen-soundtrack.json')
    .then(function(r){return r.ok?r.json():null;})
    .then(function(d){if(d&&d.tracks&&d.tracks.length>0)runPlayer(d.tracks);})
    .catch(function(){});
}
})();
`;

function formatTimestamp(iso: string): string {
  // "2026-06-15T22:28:00.000Z" → "20260615-22:28"
  return iso.slice(0, 10).replace(/-/g, "") + "-" + iso.slice(11, 16);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}

async function listVersionDirs(outputDir: string): Promise<number[]> {
  const versions: number[] = [];
  if (!await pathExists(outputDir)) return versions;

  for await (const entry of Deno.readDir(outputDir)) {
    if (entry.isDirectory && /^[1-9][0-9]*$/.test(entry.name)) {
      versions.push(Number(entry.name));
    }
  }

  return versions.toSorted((a, b) => a - b);
}

function rootLocalFile(path: string): string | undefined {
  const clean = path.split(/[?#]/)[0] ?? "";
  if (
    !clean ||
    clean.startsWith("/") ||
    clean.startsWith(".") ||
    clean.includes("/") ||
    clean.includes("\\")
  ) {
    return undefined;
  }
  return clean;
}

function referencedOutputFiles(html: string): string[] {
  const files = new Set<string>(["index.html", "ixen-soundtrack.json"]);
  for (const match of html.matchAll(/\b(?:src|href)=["']\.\/([^"']+)["']/g)) {
    const file = rootLocalFile(match[1]);
    if (file) files.add(file);
  }

  const tracksMatch = html.match(
    /<script type="application\/json" id="ixen-tracks-data">([\s\S]*?)<\/script>/,
  );
  if (tracksMatch?.[1]) {
    try {
      const tracks = JSON.parse(
        tracksMatch[1].replace(/<\\\/script>/gi, "</script>"),
      ) as Array<{ filename?: string }>;
      for (const track of tracks) {
        const file = track.filename ? rootLocalFile(track.filename) : undefined;
        if (file) files.add(file);
      }
    } catch {
      // Ignore malformed old data islands; index.html still rotates.
    }
  }

  return [...files];
}

async function rotateExistingIxen(
  outputDir: string,
): Promise<{ rotatedVersion?: number; versions: number[] }> {
  await Deno.mkdir(outputDir, { recursive: true });
  const existingVersions = await listVersionDirs(outputDir);
  const indexPath = `${outputDir}/index.html`;

  if (!await pathExists(indexPath)) {
    return { versions: existingVersions };
  }

  const html = await Deno.readTextFile(indexPath);
  if (!html.includes("@alvagante/content-ixen")) {
    return { versions: existingVersions };
  }

  const rotatedVersion = (existingVersions.at(-1) ?? 0) + 1;
  const targetDir = `${outputDir}/${rotatedVersion}`;
  await Deno.mkdir(targetDir, { recursive: true });

  for (const file of referencedOutputFiles(html)) {
    const sourcePath = `${outputDir}/${file}`;
    if (!await pathExists(sourcePath)) continue;
    await Deno.rename(sourcePath, `${targetDir}/${file}`);
  }

  return {
    rotatedVersion,
    versions: await listVersionDirs(outputDir),
  };
}

function renderVersionMenu(versions: number[]): string {
  if (versions.length === 0) return "";
  const options = versions
    .map((version) => `<option value="${version}">Version ${version}</option>`)
    .join("");
  return `
    <div class="version-menu">
      <label for="ixen-version-select">versions</label>
      <select id="ixen-version-select">
        <option value="current">Current</option>
        ${options}
      </select>
    </div>`;
}

function renderMusicPlayer(tracks: MusicTrack[]): string {
  // Prevent </script> injection in the JSON data island
  const safeJson = JSON.stringify(tracks).replace(
    /<\/script>/gi,
    "<\\/script>",
  );
  return `
<script type="application/json" id="ixen-tracks-data">${safeJson}</script>
<div id="ixen-autoplay-overlay" style="display:none">
  <div class="ixen-play-prompt">
    <span class="ixen-play-icon">&#9654;</span>
    <span class="ixen-play-label">click to play</span>
  </div>
</div>
<div id="ixen-player">
  <audio id="ixen-audio" preload="auto"></audio>
  <div id="ixen-player-row">
    <button class="ixen-pbtn" id="ixen-prev-btn" title="Previous">|&#9664;</button>
    <button class="ixen-pbtn" id="ixen-play-btn" title="Play / Pause">&#9654;</button>
    <button class="ixen-pbtn" id="ixen-next-btn" title="Next">&#9654;|</button>
    <span id="ixen-ptitle">&#8212;</span>
    <span id="ixen-ptime"></span>
    <input type="range" id="ixen-vol" min="0" max="1" step="0.05" value="1" title="Volume">
    <button class="ixen-pbtn" id="ixen-lyrics-btn" title="Show / hide lyrics">&#9834;</button>
    <button class="ixen-pbtn" id="ixen-tracks-btn" title="Track list">&#8801;</button>
  </div>
  <div id="ixen-pbar"><div id="ixen-pfill"></div></div>
</div>
<div id="ixen-lyrics-panel" hidden>
  <div class="ixen-lyrics-head" id="ixen-lyrics-head"></div>
  <pre id="ixen-lyrics-text"></pre>
</div>
  <div id="ixen-tracklist-panel" hidden></div>`;
}

function renderByline(
  credit: string | undefined,
  timestamp: string,
): string {
  const text = credit?.trim()
    ? `By ${escapeHtml(credit.trim())} — ${timestamp}`
    : timestamp;
  return `<span class="byline">${text}</span>`;
}

function renderPersonaLabel(page: IxenPage): string | undefined {
  if (page.personaDescription?.trim()) {
    return page.persona === "neutral"
      ? "custom voice"
      : `${page.persona} + custom voice`;
  }
  return page.persona === "neutral" ? undefined : page.persona;
}

function renderFooterProvenance(page: IxenPage): string {
  const meta = [
    renderPersonaLabel(page),
    page.style?.trim() ? `style: ${page.style.trim()}` : undefined,
  ].filter((item): item is string => Boolean(item)).map((item) =>
    `<span>${escapeHtml(item)}</span>`
  );
  const metaHtml = meta.length > 0
    ? `<div class="ixen-provenance-meta">${meta.join("")}</div>`
    : "";
  return `<footer class="ixen-provenance-footer"><a href="https://swamp-club.com/extensions/@alvagante/content-ixen" target="_blank" rel="noopener noreferrer">Generated with Swamp extension @alvagante/content-ixen</a>${metaHtml}</footer>`;
}

function hasPopupClass(content: string, className: string): boolean {
  return new RegExp(`class=["'][^"']*\\b${className}\\b`).test(content);
}

function renderCardDeckPopup(cards: CardItem[]): string {
  if (cards.length === 0) return "";
  const items = cards.map((card, i) => {
    const title = escapeHtml(card.title ?? `Card ${i + 1}`);
    return `  <figure class="zoom">\n    <img src="./${
      escapeHtml(card.path)
    }" alt="${title}">\n    <figcaption>${title}</figcaption>\n  </figure>`;
  }).join("\n");
  return `\n<aside class="popup" id="ixen-card-deck" hidden>\n  <div class="popup-bar"><button class="popup-close">Close Window</button></div>\n  <h2>Card Deck</h2>\n  <div class="ixen-card-deck-grid">\n${items}\n  </div>\n</aside>`;
}

function renderQuickNav(
  content: string,
  hasCheatsheet: boolean,
  hasInfographic: boolean,
  hasCards: boolean,
): string {
  const items: string[] = [];
  if (hasCards) {
    items.push(
      '<button class="ixen-accent-btn popup-trigger" data-popup="ixen-card-deck">Card Deck</button>',
    );
  }
  if (hasCheatsheet) {
    items.push('<a class="cmd" href="#ixen-cheatsheet">Cheatsheet</a>');
  }
  if (hasInfographic) {
    items.push('<a class="cmd" href="#ixen-infographic">Infographic</a>');
  }
  if (hasPopupClass(content, "concept-slide")) {
    items.push(
      '<button class="cmd popup-trigger" data-popup="ixen-all-slides">Slides</button>',
    );
  }
  if (hasPopupClass(content, "concept-note")) {
    items.push(
      '<button class="cmd popup-trigger" data-popup="ixen-all-notes">Notes</button>',
    );
  }
  if (items.length === 0) return "";
  return `
    <div class="ixen-quick-nav">
      ${items.join("\n      ")}
    </div>`;
}

function resolveInfographics(
  infographicPath?: string,
  infographicPaths?: string[],
  infographics?: InfographicItem[],
): InfographicItem[] {
  if (infographics && infographics.length > 0) return infographics;

  const paths = [
    ...(infographicPath ? [infographicPath] : []),
    ...(infographicPaths ?? []),
  ];
  return [...new Set(paths)].map((path) => ({ path }));
}

function isImagePath(path: string): boolean {
  return /\.(png|jpe?g|webp|gif|avif|svg)$/i.test(path.split(/[?#]/)[0] ?? "");
}

function renderInfographicSection(page: IxenPage): string {
  const infographics = resolveInfographics(
    page.infographicPath,
    page.infographicPaths,
    page.infographics,
  );
  if (infographics.length === 0) return "";

  const multi = infographics.length > 1;
  const popups: string[] = [];

  const frames = infographics.map((item, index) => {
    const frameTitle = item.title ?? `Infographic ${index + 1}`;
    const popupId = `ixen-infographic-prompt-${index}`;

    let promptBtn = "";
    if (item.prompt) {
      promptBtn =
        ` <button class="cmd popup-trigger" data-popup="${popupId}">prompt</button>`;
      popups.push(
        `<aside class="popup ixen-infographic-prompt-popup" id="${popupId}" hidden>` +
          `<div class="popup-bar"><button class="popup-close">Close Window</button></div>` +
          `<h2>Image prompt</h2>` +
          `<pre class="ixen-infographic-prompt-text">${
            escapeHtml(item.prompt)
          }</pre>` +
          `</aside>`,
      );
    }

    const mediaHtml = isImagePath(item.path)
      ? `<figure class="zoom ixen-infographic-img"><img src="./${
        escapeHtml(item.path)
      }" alt="${escapeHtml(frameTitle)}"></figure>`
      : `<iframe src="./${escapeHtml(item.path)}" title="${
        escapeHtml(frameTitle)
      }" loading="lazy"></iframe>`;

    return `
  <div class="ixen-infographic-frame">
    ${multi ? `<h3>${escapeHtml(frameTitle)}${promptBtn}</h3>` : ""}
    ${mediaHtml}
  </div>`;
  }).join("");

  return `
<section id="ixen-infographic" class="ixen-infographic-section" aria-label="Infographic">
  <h2>${multi ? "Infographics" : "Infographic"}${
    !multi && infographics[0]?.prompt
      ? ` <button class="cmd popup-trigger" data-popup="ixen-infographic-prompt-0">prompt</button>`
      : ""
  }</h2>${frames}
</section>
${popups.join("\n")}`
    .replace(/^\n/, "");
}

function renderBrandFooter(branding: Branding | undefined): string {
  if (!branding?.logo && !branding?.name) return "";
  const inner = branding.logo
    ? `<img src="${escapeHtml(branding.logo)}" alt="${
      escapeHtml(branding.name ?? "")
    }">`
    : escapeHtml(branding.name ?? "");
  const content = branding.link
    ? `<a href="${escapeHtml(branding.link)}">${inner}</a>`
    : inner;
  return `\n<footer class="ixen-brand-footer">${content}</footer>`;
}

function renderPage(
  page: IxenPage,
  versions: number[] = [],
  branding?: Branding,
): string {
  const title = escapeHtml(page.title);
  const provenanceTs = escapeHtml(formatTimestamp(page.generatedAt));
  const byline = renderByline(page.credits, provenanceTs);
  const tracks = page.musicTracks ?? [];
  const playerCss = MUSIC_PLAYER_CSS;
  const playerHtml = renderMusicPlayer(tracks);
  const playerJs = `<script>${MUSIC_PLAYER_JS}</script>`;
  const versionMenu = renderVersionMenu(versions);
  const infographics = resolveInfographics(
    page.infographicPath,
    page.infographicPaths,
    page.infographics,
  );
  const cards = page.cards ?? [];
  const quickNav = renderQuickNav(
    page.content,
    !!page.cheatsheetPath,
    infographics.length > 0,
    cards.length > 0,
  );
  const cardDeckPopup = renderCardDeckPopup(cards);
  const beginnerBar = page.beginnerGuideContent
    ? `\n    <div class="ixen-beginner-bar"><button class="ixen-accent-btn popup-trigger" data-popup="ixen-beginner-guide">Beginner's intro</button></div>`
    : "";
  const beginnerPopup = page.beginnerGuideContent
    ? `\n<aside class="popup beginner-guide" id="ixen-beginner-guide" hidden>\n  <div class="popup-bar"><button class="popup-close">Close Window</button></div>\n  <h2>Beginner's intro</h2>\n  ${page.beginnerGuideContent.trim()}\n</aside>`
    : "";
  const headerContent = page.headerContent?.trim()
    ? `\n<section class="ixen-extra-header">\n${page.headerContent.trim()}\n</section>`
    : "";
  const footerContent = page.footerContent?.trim()
    ? `\n<footer class="ixen-extra-footer">\n${page.footerContent.trim()}\n</footer>`
    : "";
  const cheatsheetSection = page.cheatsheetPath
    ? `
<section id="ixen-cheatsheet" class="ixen-cheatsheet-section" aria-label="Cheatsheet">
  <h2>Cheatsheet</h2>
  <iframe src="./${
      escapeHtml(page.cheatsheetPath)
    }" title="${title} Cheatsheet" loading="lazy"></iframe>
</section>`
    : "";
  const infographicSection = renderInfographicSection(page);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${PAGE_CSS}${playerCss}</style>
</head>
<body>
<!-- @alvagante/content-ixen -->
${headerContent}
<header>
  <h1>${title}</h1>
  <div class="credits">${byline}${versionMenu}${quickNav}${beginnerBar}</div>
</header>
<main>
${page.content}
</main>
${infographicSection}
${cheatsheetSection}
${footerContent}${renderBrandFooter(branding)}
${renderFooterProvenance(page)}
<script>${PAGE_JS}</script>
${playerHtml}
${playerJs}${beginnerPopup}${cardDeckPopup}
</body>
</html>
`;
}

async function storePage(
  context: ModelContext,
  page: IxenPage,
  outputDirOverride?: string,
  versionOutput = true,
): Promise<{ dataHandles: unknown[] }> {
  const outputDir = outputDirOverride ?? context.globalArgs.outputDir;
  let versions: number[] = [];

  if (outputDir) {
    if (versionOutput) {
      const rotation = await rotateExistingIxen(outputDir);
      versions = rotation.versions;
      if (rotation.rotatedVersion) {
        context.logger.info(
          "Previous Ixen output moved to {outputDir}/{version}",
          { outputDir, version: rotation.rotatedVersion },
        );
      }
    } else {
      await Deno.mkdir(outputDir, { recursive: true });
      versions = await listVersionDirs(outputDir);
    }
  }

  const pageWithVersions: IxenPage = versions.length > 0
    ? { ...page, versions }
    : page;
  const pageHandle = await context.writeResource(
    "page",
    "page",
    pageWithVersions,
  );

  const html = renderPage(
    pageWithVersions,
    versions,
    context.globalArgs.branding,
  );
  const writer = context.createFileWriter("html", "html");
  const fileHandle = await writer.writeText(html);

  if (outputDir) {
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
 * caller-supplied URLs. When music tracks are supplied (via musicTracks,
 * or the convenience args musicFilename/musicTitle/musicLyrics), a
 * self-contained fixed-bottom player is injected into the HTML shell —
 * with autoplay, progress bar, volume, lyrics panel, and multi-track
 * switching. The output file opens directly in any browser with no
 * external dependencies.
 *
 * Supports Anthropic's Messages API and any OpenAI-compatible endpoint
 * (Ollama, vLLM, Groq, Together, OpenRouter, etc.). Two entry points:
 * `generate` calls the configured inference endpoint, while `save` stores
 * a page body written by the caller — e.g. a coding agent driving swamp —
 * with no inference call and no API key.
 */
export const model = {
  type: "@alvagante/content-ixen",
  version: "2026.06.23.1",
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
    {
      toVersion: "2026.06.16.1",
      description:
        "Add music player: musicTracks, musicFilename, musicTitle, musicLyrics args; self-contained fixed-bottom player with autoplay fallback, lyrics panel, and multi-track support",
      upgradeAttributes: (old: Record<string, unknown>) => old,
    },
    {
      toVersion: "2026.06.17.1",
      description:
        "Add cheatsheetPath arg: when provided, embeds a popup iframe linking to a pre-generated cheatsheet HTML file (workflow-composed via @alvagante/content-cheatsheet). Improve multi-image placement prompt: hero image goes first prominent, concept images scatter beside relevant text.",
      upgradeAttributes: (old: Record<string, unknown>) => old,
    },
    {
      toVersion: "2026.06.17.2",
      description:
        "Add concepts[] input with per-concept image/slide/note prompt contract, top provenance header, numeric outputDir version rotation, version selector, and prepare method for workflow-first rotation before media generation.",
      upgradeAttributes: (old: Record<string, unknown>) => old,
    },
    {
      toVersion: "2026.06.17.3",
      description:
        "Add optional headerContent and footerContent HTML shell fragments, persist cheatsheetPath metadata, render cheatsheets inline at the bottom of the page, and add persona/personaDescription voice controls.",
      upgradeAttributes: (old: Record<string, unknown>) => old,
    },
    {
      toVersion: "2026.06.17.4",
      description:
        "Render headerContent above the built-in Ixen title header and reject truncated or dangling-tag generated HTML before storing output.",
      upgradeAttributes: (old: Record<string, unknown>) => old,
    },
    {
      toVersion: "2026.06.19.1",
      description:
        "Add infographicPath, infographicPaths, and infographics[] inputs; render provided infographic HTML files inline near the bottom of the page; render two-line top-right provenance with a Swamp Club extension link; add all-slides and all-notes buttons that open aggregate popups for existing concept slide and note popups; replace letter-spaced whisper text with italic serif emphasis.",
      upgradeAttributes: (old: Record<string, unknown>) => old,
    },
    {
      toVersion: "2026.06.21.1",
      description:
        "Add includeBeginnerGuide option on generate (triggers a secondary LLM call for a plain-prose IT-beginner intro) and beginnerGuideContent on save (caller-supplied HTML). When present, a 'Beginner's intro' button appears in the page header opening the guide in a popup. Restructure page header: move 'Generated with Swamp extension' attribution to a footer; top-right now shows byline + version menu + quick-nav row (Cheatsheet/Infographic as anchor links, Slides/Notes as popup triggers). Add id='ixen-cheatsheet' and id='ixen-infographic' to their sections.",
      upgradeAttributes: (old: Record<string, unknown>) => old,
    },
    {
      toVersion: "2026.06.21.2",
      description:
        "Add prompt field to InfographicItem; image-path infographics (png/jpg/webp/gif/avif/svg) now render as zoomable lightbox images instead of iframes; prompt is hidden by default and accessible via a 'prompt' popup button next to the section heading (single) or frame title (multiple).",
      upgradeAttributes: (old: Record<string, unknown>) => old,
    },
    {
      toVersion: "2026.06.22.1",
      description:
        "Add cards[] input (per-concept card images from @alvagante/content-card, matched by index). Each card renders alongside its concept opposite the concept image. A 'Card Deck' accent button opens a popup grid of all cards. Beginner's intro button also uses the new accent style. Remove SVG generation instructions — images are caller-supplied only.",
      upgradeAttributes: (old: Record<string, unknown>) => old,
    },
    {
      toVersion: "2026.06.22.2",
      description:
        "Place concept cards as medium-small right-side cards, add full-card hover previews, and use delegated popup/lightbox handlers so card deck cards can be previewed and zoomed.",
      upgradeAttributes: (old: Record<string, unknown>) => old,
    },
    {
      toVersion: "2026.06.23.1",
      description:
        "Consolidate LLM utilities, image-schema types, and style prefix maps into shared/content_shared.ts; add branding globalArg (logo footer) and provenance persona/style metadata; no required resource schema changes.",
      upgradeAttributes: (old: Record<string, unknown>) => old,
    },
  ],
  globalArguments: z.object({
    apiFormat: ApiFormatSchema.default("anthropic"),
    apiKey: z.string().optional().meta({ sensitive: true }),
    baseUrl: z.string().optional(),
    outputDir: z.string().optional(),
    branding: BrandingSchema.optional(),
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
    prepare: {
      description:
        "Prepare an output directory for a new Ixen run by moving the existing generated Ixen page and referenced media into the next numeric version directory.",
      arguments: z.object({
        outputDir: z.string().optional(),
        enabled: z.boolean().default(true),
      }),
      execute: async (
        args: { outputDir?: string; enabled: boolean },
        context: ModelContext,
      ) => {
        if (!args.enabled) return { dataHandles: [] };

        const outputDir = args.outputDir ?? context.globalArgs.outputDir;
        if (!outputDir) return { dataHandles: [] };

        const rotation = await rotateExistingIxen(outputDir);
        if (rotation.rotatedVersion) {
          context.logger.info(
            "Previous Ixen output moved to {outputDir}/{version}",
            { outputDir, version: rotation.rotatedVersion },
          );
        } else {
          context.logger.info("No previous Ixen output found in {outputDir}", {
            outputDir,
          });
        }

        return { dataHandles: [] };
      },
    },
    generate: {
      description:
        "Generate a first-person narrated Ixen page on the given topic using a configured LLM endpoint. Supply musicTracks (or the convenience musicFilename/musicTitle/musicLyrics args) to embed a self-contained music player.",
      arguments: z.object({
        topic: z.string().min(1),
        narrator: z.string().min(1).optional(),
        details: z.string().optional(),
        media: z.string().optional(),
        mediaItems: z.array(MediaItemSchema).optional(),
        concepts: z.array(ConceptSchema).optional().describe(
          "Ordered concepts to cover. Each concept can provide name, details, imagePrompt, imagePath, or imageFilename. The generated page creates an image placement plus slide and explanatory popups for every concept.",
        ),
        skillLevel: SkillLevelSchema.default("intermediate"),
        outputLength: OutputLengthSchema.default("medium"),
        model: z.string().default("claude-opus-4-8"),
        persona: PersonaSchema.default("neutral"),
        personaDescription: z.string().min(1).optional(),
        style: z.string().min(1).optional().describe(
          "Optional style label rendered in the provenance footer, usually the visual style preset used for the surrounding generated media.",
        ),
        credits: z.string().optional(),
        outputDir: z.string().optional(),
        versionOutput: z.boolean().default(true).describe(
          "When true, move an existing generated Ixen in outputDir to the next numeric version directory before writing the new index.html. Workflows that call prepare first should pass false.",
        ),
        musicTracks: z.array(MusicTrackSchema).optional(),
        musicFilename: z.string().optional(),
        musicTitle: z.string().optional(),
        musicLyrics: z.string().nullish(),
        headerContent: z.string().optional().describe(
          "Optional raw HTML fragment rendered below the Ixen title/provenance header and above the generated body.",
        ),
        footerContent: z.string().optional().describe(
          "Optional raw HTML fragment rendered after the generated body and inline infographic/cheatsheet sections.",
        ),
        cheatsheetPath: z.string().optional().describe(
          "Relative path (within outputDir) to a pre-generated cheatsheet HTML file. When provided, the cheatsheet is embedded inline near the bottom of the page.",
        ),
        infographicPath: z.string().optional().describe(
          "Relative path (within outputDir) to a pre-generated infographic HTML file. When provided, the infographic is embedded inline near the bottom of the page.",
        ),
        infographicPaths: z.array(z.string()).optional().describe(
          "Relative paths (within outputDir) to multiple pre-generated infographic HTML files.",
        ),
        infographics: z.array(InfographicItemSchema).optional().describe(
          "Infographic embeds with relative HTML path and optional title.",
        ),
        cards: z.array(CardItemSchema).optional().describe(
          "Per-concept card images generated by @alvagante/content-card. Matched by index to the concepts array. Each card is shown alongside its concept section and a 'Card Deck' button at the top opens a popup grid of all cards.",
        ),
        includeBeginnerGuide: z.boolean().default(false).describe(
          "When true, generates a plain-prose beginner's introduction to the topic and embeds it as a popup accessible via a 'Beginner's intro' button at the top of the page. Audience: IT-literate readers with no prior knowledge of the specific topic.",
        ),
      }),
      execute: async (
        args: {
          topic: string;
          narrator?: string;
          details?: string;
          media?: string;
          mediaItems?: MediaItem[];
          concepts?: Concept[];
          skillLevel: SkillLevel;
          outputLength: OutputLength;
          model: string;
          persona: Persona;
          personaDescription?: string;
          style?: string;
          credits?: string;
          outputDir?: string;
          versionOutput: boolean;
          musicTracks?: MusicTrack[];
          musicFilename?: string;
          musicTitle?: string;
          musicLyrics?: string | null;
          headerContent?: string;
          footerContent?: string;
          cheatsheetPath?: string;
          infographicPath?: string;
          infographicPaths?: string[];
          infographics?: InfographicItem[];
          cards?: CardItem[];
          includeBeginnerGuide?: boolean;
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
          persona: args.persona,
          apiFormat,
        });

        const systemPrompt = buildSystemPrompt(
          args.skillLevel,
          args.narrator,
          args.persona,
          args.personaDescription,
        );
        const userMessage = buildUserMessage(
          args.topic,
          args.details,
          args.media,
          args.mediaItems,
          args.concepts,
          args.cards,
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
        if (isTruncatedStopReason(stopReason)) {
          throw new Error(
            `Inference API truncated Ixen page output (stop_reason: ${stopReason}, outputLength: ${args.outputLength}, maxTokens: ${maxTokens}). Retry with outputLength=long or a model/context limit that can complete the page.`,
          );
        }

        const { title, body: content } = splitTitleAndBody(
          rawContent,
          args.topic,
        );
        if (hasDanglingHtmlTag(content)) {
          throw new Error(
            "Inference API returned an incomplete Ixen HTML fragment ending inside a tag. Refusing to store a malformed page; retry generation.",
          );
        }
        const wordCount = countWords(content);
        const musicTracks = resolveMusicTracks(
          args.musicTracks,
          args.musicFilename,
          args.musicTitle,
          args.musicLyrics,
        );

        let beginnerGuideContent: string | undefined;
        if (args.includeBeginnerGuide === true) {
          context.logger.info("Generating beginner guide for {topic}", {
            topic: args.topic,
          });
          beginnerGuideContent = await generateBeginnerGuide(
            apiFormat,
            apiKey,
            baseUrl,
            args.model,
            args.topic,
            args.details,
            resolveConcepts(args.concepts, args.mediaItems),
            context.logger,
          );
        }

        return await storePage(
          context,
          {
            title,
            narrator: args.narrator ?? args.topic,
            topic: args.topic,
            details: args.details,
            content,
            wordCount,
            skillLevel: args.skillLevel,
            outputLength: args.outputLength,
            model: args.model,
            persona: args.persona,
            personaDescription: args.personaDescription,
            style: args.style,
            media: args.media,
            mediaItems: resolveMediaItems(args.media, args.mediaItems),
            concepts: resolveConcepts(args.concepts, args.mediaItems),
            musicTracks: musicTracks.length > 0 ? musicTracks : undefined,
            credits: args.credits,
            headerContent: args.headerContent,
            footerContent: args.footerContent,
            cheatsheetPath: args.cheatsheetPath,
            infographicPath: args.infographicPath,
            infographicPaths: args.infographicPaths,
            infographics: resolveInfographics(
              args.infographicPath,
              args.infographicPaths,
              args.infographics,
            ),
            cards: args.cards,
            beginnerGuideContent,
            generatedAt: new Date().toISOString(),
          },
          args.outputDir,
          args.versionOutput,
        );
      },
    },
    save: {
      description:
        "Store an externally written Ixen page body (e.g. authored by the calling agent) without making any inference call — no API key or endpoint required. Supply musicTracks (or the convenience musicFilename/musicTitle/musicLyrics args) to embed a music player.",
      arguments: z.object({
        content: z.string().min(1),
        title: z.string().optional(),
        narrator: z.string().min(1),
        topic: z.string().min(1),
        details: z.string().optional(),
        media: z.string().optional(),
        mediaItems: z.array(MediaItemSchema).optional(),
        concepts: z.array(ConceptSchema).optional(),
        skillLevel: SkillLevelSchema.default("intermediate"),
        outputLength: OutputLengthSchema.optional(),
        model: z.string().default("external"),
        persona: PersonaSchema.default("neutral"),
        personaDescription: z.string().min(1).optional(),
        style: z.string().min(1).optional().describe(
          "Optional style label rendered in the provenance footer, usually the visual style preset used for the surrounding generated media.",
        ),
        credits: z.string().optional(),
        outputDir: z.string().optional(),
        versionOutput: z.boolean().default(true),
        musicTracks: z.array(MusicTrackSchema).optional(),
        musicFilename: z.string().optional(),
        musicTitle: z.string().optional(),
        musicLyrics: z.string().nullish(),
        headerContent: z.string().optional().describe(
          "Optional raw HTML fragment rendered below the Ixen title/provenance header and above the supplied body.",
        ),
        footerContent: z.string().optional().describe(
          "Optional raw HTML fragment rendered after the supplied body and inline infographic/cheatsheet sections.",
        ),
        cheatsheetPath: z.string().optional().describe(
          "Relative path (within outputDir) to a pre-generated cheatsheet HTML file. When provided, the cheatsheet is embedded inline near the bottom of the page.",
        ),
        infographicPath: z.string().optional().describe(
          "Relative path (within outputDir) to a pre-generated infographic HTML file. When provided, the infographic is embedded inline near the bottom of the page.",
        ),
        infographicPaths: z.array(z.string()).optional().describe(
          "Relative paths (within outputDir) to multiple pre-generated infographic HTML files.",
        ),
        infographics: z.array(InfographicItemSchema).optional().describe(
          "Infographic embeds with relative HTML path and optional title.",
        ),
        cards: z.array(CardItemSchema).optional().describe(
          "Per-concept card images. Matched by index to the concepts array. Each card is shown alongside its concept section and a 'Card Deck' button at the top opens a popup grid of all cards.",
        ),
        beginnerGuideContent: z.string().optional().describe(
          "Pre-generated HTML fragment for the beginner's intro popup. When provided, a 'Beginner's intro' button appears at the top of the page opening this content in a popup.",
        ),
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
          concepts?: Concept[];
          skillLevel: SkillLevel;
          outputLength?: OutputLength;
          model: string;
          persona: Persona;
          personaDescription?: string;
          style?: string;
          credits?: string;
          outputDir?: string;
          versionOutput: boolean;
          musicTracks?: MusicTrack[];
          musicFilename?: string;
          musicTitle?: string;
          musicLyrics?: string | null;
          headerContent?: string;
          footerContent?: string;
          cheatsheetPath?: string;
          infographicPath?: string;
          infographicPaths?: string[];
          infographics?: InfographicItem[];
          cards?: CardItem[];
          beginnerGuideContent?: string;
        },
        context: ModelContext,
      ) => {
        const { title, body: content } = args.title
          ? { title: args.title, body: args.content.trim() }
          : splitTitleAndBody(args.content.trim(), args.topic);
        const wordCount = countWords(content);
        const outputLength = args.outputLength ??
          deriveOutputLength(wordCount);
        const musicTracks = resolveMusicTracks(
          args.musicTracks,
          args.musicFilename,
          args.musicTitle,
          args.musicLyrics,
        );

        context.logger.info("Saving externally written Ixen page", {
          topic: args.topic,
          narrator: args.narrator,
          wordCount,
          persona: args.persona,
        });

        return await storePage(
          context,
          {
            title,
            narrator: args.narrator,
            topic: args.topic,
            details: args.details,
            content,
            wordCount,
            skillLevel: args.skillLevel,
            outputLength,
            model: args.model,
            persona: args.persona,
            personaDescription: args.personaDescription,
            style: args.style,
            media: args.media,
            mediaItems: resolveMediaItems(args.media, args.mediaItems),
            concepts: resolveConcepts(args.concepts, args.mediaItems),
            musicTracks: musicTracks.length > 0 ? musicTracks : undefined,
            credits: args.credits,
            headerContent: args.headerContent,
            footerContent: args.footerContent,
            cheatsheetPath: args.cheatsheetPath,
            infographicPath: args.infographicPath,
            infographicPaths: args.infographicPaths,
            infographics: resolveInfographics(
              args.infographicPath,
              args.infographicPaths,
              args.infographics,
            ),
            cards: args.cards,
            beginnerGuideContent: args.beginnerGuideContent,
            generatedAt: new Date().toISOString(),
          },
          args.outputDir,
          args.versionOutput,
        );
      },
    },
  },
};

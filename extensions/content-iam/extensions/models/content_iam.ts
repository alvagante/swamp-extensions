/**
 * Generates "I Am" biography minisites — self-narrated, editorial-style web
 * pages where a real person, fictional character, or persona speaks in first
 * person about their own life. Facets replace concepts; a Dateline replaces
 * the cheatsheet; an Influence Map replaces the infographic. Visual register:
 * editorial magazine, not terminal screen.
 *
 * @module
 */
import { z } from "npm:zod@4";
import {
  type ApiFormat,
  ApiFormatSchema,
  type Branding,
  BrandingSchema,
  buildRequest,
  CARD_STYLE_PREFIXES,
  type CardStyle,
  extractContent,
  IMAGE_STYLE_PREFIXES,
  type ImageStyle,
  type Persona,
  PERSONA_DIRECTIVES,
  PersonaSchema,
  resolveBaseUrl,
} from "./content_shared.ts";

// ─── Schemas ─────────────────────────────────────────────────────────────────

const OutputLengthSchema = z.enum(["short", "medium", "long"]);
type OutputLength = z.infer<typeof OutputLengthSchema>;

const SubjectTypeSchema = z.enum(["real", "fictional", "persona"]);
type SubjectType = z.infer<typeof SubjectTypeSchema>;

const SourceModeSchema = z.enum(["wikipedia", "user", "both"]);

const MusicTrackSchema = z.object({
  title: z.string(),
  filename: z.string(),
  lyrics: z.string().optional(),
});
type MusicTrack = z.infer<typeof MusicTrackSchema>;

const FacetSchema = z.object({
  name: z.string().min(1),
  details: z.string().optional(),
  imagePrompt: z.string().optional(),
  imagePath: z.string().optional(),
  imageFilename: z.string().optional(),
  cardPath: z.string().optional(),
  cardDesc: z.string().optional(),
});
type Facet = z.infer<typeof FacetSchema>;

type ResolvedFacet = Facet & { imagePath?: string };

const InfluenceItemSchema = z.object({
  path: z.string(),
  title: z.string().optional(),
  prompt: z.string().optional(),
});
type InfluenceItem = z.infer<typeof InfluenceItemSchema>;

const CardItemSchema = z.object({
  path: z.string(),
  title: z.string().optional(),
  desc: z.string().optional(),
});

const PageSchema = z.object({
  subject: z.string(),
  title: z.string(),
  subjectType: SubjectTypeSchema,
  narrator: z.string(),
  details: z.string().optional(),
  content: z.string(),
  wordCount: z.number().int().nonnegative(),
  outputLength: OutputLengthSchema,
  model: z.string(),
  persona: PersonaSchema,
  personaDescription: z.string().optional(),
  style: z.string().optional(),
  credits: z.string().optional(),
  headerContent: z.string().optional(),
  footerContent: z.string().optional(),
  facets: z.array(FacetSchema).optional(),
  cards: z.array(CardItemSchema).optional(),
  musicTracks: z.array(MusicTrackSchema).optional(),
  portraitPath: z.string().optional(),
  datelinePath: z.string().optional(),
  influencePath: z.string().optional(),
  influencePaths: z.array(z.string()).optional(),
  influences: z.array(InfluenceItemSchema).optional(),
  versions: z.array(z.number().int().positive()).optional(),
  generatedAt: z.string(),
  wikipediaTitle: z.string().optional(),
  metaBorn: z.string().optional(),
  metaDied: z.string().optional(),
  metaNationality: z.string().optional(),
  metaEra: z.string().optional(),
  metaDomain: z.string().optional(),
});

type IamPage = z.infer<typeof PageSchema>;

type ModelContext = {
  globalArgs: {
    apiFormat: ApiFormat;
    apiKey?: string;
    baseUrl?: string;
    outputDir?: string;
    branding?: Branding;
    headerContent?: string;
    footerContent?: string;
  };
  writeResource: (
    specName: "page" | "tracks",
    name: string,
    content: unknown,
  ) => Promise<unknown>;
  createFileWriter: (
    specName: "html",
    name: string,
  ) => { writeText: (text: string) => Promise<unknown> };
  logger: {
    info: (msg: string, props?: Record<string, unknown>) => void;
    error: (msg: string, props?: Record<string, unknown>) => void;
  };
};

// ─── Wikipedia ───────────────────────────────────────────────────────────────

async function fetchWikipediaExtract(
  title: string,
): Promise<string | undefined> {
  const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${
    encodeURIComponent(title)
  }&prop=extracts&exintro=1&explaintext=1&format=json&origin=*`;
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "swamp-content-iam/1.0" },
    });
    if (!response.ok) return undefined;
    const json = await response.json() as {
      query?: { pages?: Record<string, { extract?: string }> };
    };
    const pages = json.query?.pages;
    if (!pages) return undefined;
    const page = Object.values(pages)[0];
    return page?.extract?.trim() || undefined;
  } catch {
    return undefined;
  }
}

// ─── Image generation ────────────────────────────────────────────────────────

async function generateImageBytes(
  apiKey: string,
  model: string,
  prompt: string,
  style: ImageStyle,
  background: string,
  size: string,
  quality: string,
): Promise<Uint8Array> {
  const prefix = IMAGE_STYLE_PREFIXES[style] ?? "";
  const fullPrompt = prefix ? `${prefix} ${prompt}`.trim() : prompt;
  const isDalle3 = model.startsWith("dall-e-3");
  const body: Record<string, unknown> = {
    model,
    prompt: fullPrompt,
    n: 1,
    size,
    quality,
  };
  if (isDalle3) {
    body.response_format = "b64_json";
  } else {
    body.output_format = "png";
    if (background !== "white") body.background = background;
  }
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI images API error ${response.status}: ${errorBody}`);
  }
  const json = await response.json() as { data: Array<{ b64_json: string }> };
  const b64 = json.data[0]?.b64_json;
  if (!b64) throw new Error("No image data in OpenAI response");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function generateCardBytes(
  apiKey: string,
  model: string,
  facetPrompt: string,
  facetName: string,
  cardStyle: CardStyle,
  size: string,
  quality: string,
): Promise<Uint8Array> {
  const prefix = CARD_STYLE_PREFIXES[cardStyle] ?? "";
  const prompt = `${prefix} Subject: ${facetName}. Scene: ${facetPrompt}`
    .trim();
  return generateImageBytes(
    apiKey,
    model,
    prompt,
    "blueprint",
    "opaque",
    size,
    quality,
  );
}

// ─── Track manifest ──────────────────────────────────────────────────────────

interface TrackSidecarEntry {
  title: string;
  lyrics?: string;
}
type TrackSidecar = Record<string, TrackSidecarEntry>;

async function readTrackSidecar(outputDir: string): Promise<TrackSidecar> {
  try {
    const text = await Deno.readTextFile(`${outputDir}/iam-tracks.json`);
    return JSON.parse(text) as TrackSidecar;
  } catch {
    return {};
  }
}

async function writeTrackSidecar(
  outputDir: string,
  sidecar: TrackSidecar,
): Promise<void> {
  await Deno.writeTextFile(
    `${outputDir}/iam-tracks.json`,
    JSON.stringify(sidecar, null, 2),
  );
}

async function scanAudioFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  try {
    for await (const entry of Deno.readDir(dir)) {
      if (entry.isFile && /\.(mp3|wav|ogg|m4a)$/i.test(entry.name)) {
        files.push(entry.name);
      }
    }
  } catch { /* dir absent */ }
  return files.sort();
}

// ─── Registry ────────────────────────────────────────────────────────────────

async function upsertIamRegistry(
  registryPath: string,
  entry: {
    slug: string;
    subject: string;
    title: string;
    date: string;
    description?: string;
  },
): Promise<void> {
  let raw = "";
  try {
    raw = await Deno.readTextFile(registryPath);
  } catch { /* new file */ }

  const lines = raw.split("\n");
  const slugMark = `slug: ${entry.slug}`;
  const startIdx = lines.findIndex((l) => l.includes(slugMark));

  const descLines = entry.description?.trim()
    ? [`  description: >-`, `    ${entry.description.replace(/\n/g, "\n    ")}`]
    : [];
  const block = [
    `- slug: ${entry.slug}`,
    `  subject: ${entry.subject}`,
    `  title: ${entry.title}`,
    `  date: "${entry.date.slice(0, 10)}"`,
    ...descLines,
  ];

  if (startIdx === -1) {
    const headerLines = lines.filter((l) => l.startsWith("#"));
    const bodyLines = lines.filter((l) => !l.startsWith("#")).join("\n").trim();
    const parts = [
      headerLines.join("\n"),
      block.join("\n"),
      bodyLines,
    ].filter(Boolean);
    raw = parts.join("\n") + "\n";
  } else {
    let endIdx = startIdx + 1;
    while (
      endIdx < lines.length && lines[endIdx] !== "" &&
      !lines[endIdx].startsWith("- ")
    ) endIdx++;
    lines.splice(startIdx, endIdx - startIdx, ...block);
    raw = lines.join("\n");
    if (!raw.endsWith("\n")) raw += "\n";
  }

  await Deno.writeTextFile(registryPath, raw);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

function isTruncatedStopReason(stopReason: string): boolean {
  const n = stopReason.toLowerCase();
  return n === "max_tokens" || n === "length" || n.includes("max_token");
}

function hasDanglingHtmlTag(html: string): boolean {
  const lastOpen = html.lastIndexOf("<");
  if (lastOpen === -1) return false;
  return lastOpen > html.lastIndexOf(">");
}

function formatTimestamp(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, "") + "-" + iso.slice(11, 16);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return false;
    throw e;
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
    !clean || clean.startsWith("/") || clean.startsWith(".") ||
    clean.includes("/") || clean.includes("\\")
  ) return undefined;
  return clean;
}

function referencedOutputFiles(html: string): string[] {
  const files = new Set<string>(["index.html"]);
  for (const match of html.matchAll(/\b(?:src|href)=["']\.\/([^"']+)["']/g)) {
    const file = rootLocalFile(match[1]);
    if (file) files.add(file);
  }
  const tracksMatch = html.match(
    /<script type="application\/json" id="iam-tracks-data">([\s\S]*?)<\/script>/,
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
    } catch { /* ignore */ }
  }
  return [...files];
}

function rebaseVersionedTrackPaths(html: string): string {
  return html.replace(
    /(<script type="application\/json" id="iam-tracks-data">)([\s\S]*?)(<\/script>)/,
    (_match, open: string, rawJson: string, close: string) => {
      let tracks: Array<{ filename?: string }>;
      try {
        tracks = JSON.parse(rawJson.replace(/<\\\/script>/gi, "</script>"));
      } catch {
        return _match;
      }
      if (!Array.isArray(tracks)) return _match;
      const rebased = tracks.map((track) => {
        const filename = track.filename;
        if (
          typeof filename === "string" && !filename.startsWith("/") &&
          !filename.startsWith("./") && !filename.startsWith("../") &&
          !/^[a-z][a-z0-9+.-]*:/i.test(filename) && filename.includes("/")
        ) {
          return { ...track, filename: `../${filename}` };
        }
        return track;
      });
      return `${open}${
        JSON.stringify(rebased).replace(/<\/script>/gi, "<\\/script>")
      }${close}`;
    },
  );
}

async function rotateExistingPage(
  outputDir: string,
): Promise<{ rotatedVersion?: number; versions: number[] }> {
  await Deno.mkdir(outputDir, { recursive: true });
  const existingVersions = await listVersionDirs(outputDir);
  const indexPath = `${outputDir}/index.html`;
  if (!await pathExists(indexPath)) return { versions: existingVersions };
  const html = await Deno.readTextFile(indexPath);
  if (!html.includes("@alvagante/content-iam")) {
    return { versions: existingVersions };
  }
  const rotatedVersion = (existingVersions.at(-1) ?? 0) + 1;
  const targetDir = `${outputDir}/${rotatedVersion}`;
  await Deno.mkdir(targetDir, { recursive: true });
  for (const file of referencedOutputFiles(html)) {
    if (file === "iam-tracks.json") continue; // sidecar survives rotation
    const sourcePath = `${outputDir}/${file}`;
    if (!await pathExists(sourcePath)) continue;
    await Deno.rename(sourcePath, `${targetDir}/${file}`);
  }
  await Deno.writeTextFile(
    `${targetDir}/index.html`,
    rebaseVersionedTrackPaths(html),
  );
  return { rotatedVersion, versions: await listVersionDirs(outputDir) };
}

function resolveFacets(facets?: Facet[]): ResolvedFacet[] {
  return (facets ?? []).map((f) => ({
    ...f,
    imagePath: f.imagePath ?? f.imageFilename,
  }));
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

function resolveInfluences(
  influencePath?: string,
  influencePaths?: string[],
  influences?: InfluenceItem[],
): InfluenceItem[] {
  if (influences && influences.length > 0) return influences;
  const paths = [
    ...(influencePath ? [influencePath] : []),
    ...(influencePaths ?? []),
  ];
  return [...new Set(paths)].map((path) => ({ path }));
}

function isImagePath(path: string): boolean {
  return /\.(png|jpe?g|webp|gif|avif|svg)$/i.test(path.split(/[?#]/)[0] ?? "");
}

function relativeAssetPath(path: string): string {
  return /^(?:[a-z]+:|\/|\.\/|\.\.\/)/i.test(path) ? path : `./${path}`;
}

function splitTitleAndBody(
  content: string,
  fallback: string,
): { title: string; body: string } {
  const idx = content.indexOf("\n");
  if (idx === -1) return { title: fallback, body: content };
  const first = content.slice(0, idx).trim();
  if (first.startsWith("<")) return { title: fallback, body: content };
  const title = first.replace(/^#+\s*/, "").trim() || fallback;
  return { title, body: content.slice(idx + 1).trim() };
}

// ─── CSS ─────────────────────────────────────────────────────────────────────

const PAGE_CSS = `
:root {
  --bg: #faf8f4;
  --ink: #1a1a18;
  --dim: #6b6360;
  --accent: #8b5e3c;
  --rule: #d4cdc8;
  --tinted: #f0ede6;
  --slides-bg: #f2ede5;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  font-family: Georgia, "Times New Roman", "Liberation Serif", serif;
  font-size: 16px; line-height: 1.72; color: var(--ink);
  background: var(--bg); margin: 0; padding: 0;
}

/* ── Layout ── */
.iam-layout {
  display: grid;
  grid-template-columns: 210px minmax(0, 1fr);
  min-height: 100vh;
}
.iam-toc {
  position: sticky; top: 0; align-self: start;
  height: 100vh; overflow-y: auto;
  padding: 2.2rem 1.2rem 2rem 1.8rem;
  border-right: 1px solid var(--rule);
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 0.76rem;
}
.iam-toc-label {
  font-size: 0.6rem; letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--dim); font-weight: 700; margin: 0 0 1rem; display: block;
}
.iam-toc-list { list-style: none; margin: 0; padding: 0; }
.iam-toc-item { margin: 0; }
.iam-toc-link {
  display: block; padding: 0.28rem 0.5rem 0.28rem 0.6rem;
  color: var(--dim); text-decoration: none;
  border-left: 2px solid transparent;
  transition: color 150ms, border-color 150ms;
  line-height: 1.35;
}
.iam-toc-link:hover, .iam-toc-link.is-active {
  color: var(--accent); border-left-color: var(--accent);
}
.iam-toc-divider { height: 1px; background: var(--rule); margin: 0.9rem 0 0.8rem; }
.iam-toc-cards-btn {
  display: block; width: 100%; text-align: left;
  background: none; border: 1px solid var(--accent); color: var(--accent);
  cursor: pointer; font-family: system-ui, sans-serif;
  font-size: 0.65rem; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase; padding: 0.3rem 0.5rem;
  margin-top: 0.8rem;
}
.iam-toc-cards-btn:hover { background: var(--accent); color: #fff; }
.iam-version-block {
  margin-top: 1rem; padding-top: 0.8rem; border-top: 1px solid var(--rule);
}
.iam-version-block label {
  display: block; font-size: 0.6rem; text-transform: uppercase;
  letter-spacing: 0.1em; color: var(--dim); margin-bottom: 0.3rem;
}
.iam-version-block select {
  width: 100%; font-family: system-ui, sans-serif; font-size: 0.72rem;
  color: var(--ink); background: var(--bg); border: 1px solid var(--rule);
  padding: 0.28rem 0.4rem;
}
.iam-content {
  padding: 3rem 3.5rem 8rem 3rem;
  max-width: 740px;
}

/* ── Masthead ── */
.iam-masthead {
  margin: 0 0 3rem;
  padding-bottom: 1.5rem;
  border-bottom: 2px solid var(--ink);
}
.iam-name {
  font-family: Georgia, serif;
  font-size: clamp(2.8rem, 5.5vw, 5rem);
  font-weight: 400; line-height: 1.0; letter-spacing: -0.01em;
  margin: 0 0 0.35rem; color: var(--ink);
}
.iam-title-line {
  font-family: Georgia, serif; font-style: italic;
  font-size: 1.1rem; color: var(--dim); margin: 0 0 1rem;
}
.iam-meta-strip {
  display: flex; flex-direction: column; gap: 0.35rem;
  font-family: system-ui, sans-serif; font-size: 0.74rem;
  color: var(--dim); margin-bottom: 0;
}
.iam-meta-item { display: flex; gap: 0.35rem; align-items: baseline; }
.iam-meta-label {
  font-size: 0.6rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.09em; color: var(--accent);
}
.iam-lead { overflow: hidden; }
.iam-portrait {
  float: right; width: min(220px, 36%);
  margin: 0.2rem 0 1rem 1.8rem;
}
.iam-portrait img {
  width: 100%; display: block; cursor: zoom-in;
  border: 1px solid var(--rule);
}
.iam-portrait figcaption {
  font-family: system-ui, sans-serif; font-size: 0.68rem;
  color: var(--dim); margin-top: 0.3rem; font-style: italic;
}

/* ── Section heads ── */
.iam-section-head {
  display: flex; align-items: baseline; gap: 0.9rem;
  margin: 3.5rem 0 1.4rem; padding-bottom: 0.45rem;
  border-bottom: 1px solid var(--rule); clear: both;
}
.iam-section-num {
  font-family: system-ui, sans-serif; font-size: 0.6rem; font-weight: 700;
  letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent);
  flex-shrink: 0;
}
.iam-section-name {
  font-family: system-ui, sans-serif; font-size: 0.68rem; font-weight: 700;
  letter-spacing: 0.12em; text-transform: uppercase; color: var(--dim);
}

/* ── Text rhythm ── */
p { margin: 0 0 1.05em; }
p strong { color: var(--ink); }
blockquote.iam-pull {
  margin: 2rem 0; padding: 0 0 0 1.4rem;
  border-left: 3px solid var(--accent);
  font-style: italic; font-size: 1.12rem; color: var(--dim); line-height: 1.55;
}
p.iam-aside {
  font-family: system-ui, sans-serif; font-size: 0.78rem;
  color: var(--dim); font-style: italic; margin: -0.5em 0 1em;
}

/* ── Facets ── */
.iam-facet {
  clear: both; margin: 2.5rem 0;
  padding-top: 1rem; border-top: 1px solid var(--rule);
}
h2.iam-facet-name {
  font-size: 1.35rem; font-weight: 400; font-style: italic;
  margin: 0 0 0.9rem; color: var(--ink);
}
figure.iam-facet-img { margin: 0; }
figure.iam-facet-img img { width: 100%; display: block; cursor: zoom-in; }
figure.iam-facet-img figcaption {
  font-family: system-ui, sans-serif; font-size: 0.68rem;
  color: var(--dim); margin-top: 0.3rem; font-style: italic;
}
.iam-float-left {
  float: left; width: min(250px, 42%);
  margin: 0.2rem 1.5rem 0.8rem 0;
}
.iam-float-right {
  float: right; width: min(250px, 42%);
  margin: 0.2rem 0 0.8rem 1.5rem;
}
.iam-facet-controls { margin: 0.5rem 0 0.7rem; display: flex; gap: 0.5rem; flex-wrap: wrap; }
button.iam-drawer-trigger {
  background: none; border: 1px solid var(--accent); color: var(--accent);
  cursor: pointer; font-family: system-ui, sans-serif;
  font-size: 0.68rem; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase; padding: 0.28rem 0.7rem;
}
button.iam-drawer-trigger:hover { background: var(--accent); color: #fff; }
figure.iam-facet-card { display: none; }

/* ── Key Works ── */
ul.iam-works { list-style: none; margin: 0; padding: 0; }
li.iam-work {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-areas: "title year" "desc desc";
  gap: 0.1rem 1rem;
  padding: 0.75rem 0; border-bottom: 1px solid var(--rule);
}
li.iam-work:first-child { border-top: 1px solid var(--rule); }
.iam-work-title { font-style: italic; grid-area: title; }
.iam-work-year {
  grid-area: year; align-self: center;
  font-family: system-ui, sans-serif; font-size: 0.72rem; color: var(--dim);
}
.iam-work-desc {
  grid-area: desc; font-family: system-ui, sans-serif;
  font-size: 0.8rem; color: var(--dim);
}

/* ── Quotes ── */
blockquote.iam-quote { margin: 1.5rem 0; padding: 1rem 1.2rem; }
blockquote.iam-quote-verified { border-left: 3px solid var(--ink); }
blockquote.iam-quote-verified p { font-size: 1.08rem; font-style: italic; margin: 0 0 0.45rem; }
blockquote.iam-quote-verified footer {
  font-family: system-ui, sans-serif; font-size: 0.74rem; color: var(--dim);
}
.iam-ai-voices-wrapper {
  background: var(--tinted);
  padding: 1.4rem 1.4rem 0.6rem;
  margin: 0 -1.4rem;
}
.iam-ai-voices-label {
  font-family: system-ui, sans-serif; font-size: 0.6rem;
  letter-spacing: 0.13em; text-transform: uppercase;
  color: var(--dim); font-weight: 700; margin: 0 0 1rem;
  display: block;
}
blockquote.iam-quote-ai {
  border-left: 2px solid var(--dim); margin: 0.8rem 0;
  padding: 0 0 0 1rem;
}
blockquote.iam-quote-ai p {
  font-size: 1rem; font-style: italic; color: var(--dim); margin: 0;
}

/* ── Links ── */
.iam-links-list { display: flex; flex-direction: column; gap: 0.6rem; }
a.iam-link {
  display: grid; grid-template-columns: 1fr;
  gap: 0.12rem; padding: 0.75rem;
  border: 1px solid var(--rule); text-decoration: none; color: inherit;
  transition: border-color 150ms;
}
a.iam-link:hover { border-color: var(--accent); }
.iam-link-title { font-style: italic; font-size: 0.92rem; color: var(--accent); }
.iam-link-source { font-family: system-ui, sans-serif; font-size: 0.68rem; color: var(--dim); }
.iam-link-desc { font-family: system-ui, sans-serif; font-size: 0.78rem; color: var(--dim); }

/* ── Timeline (dateline) section ── */
.iam-dateline-section { clear: both; margin: 3.5rem 0 0; }
.iam-dateline-section iframe {
  width: 100%; height: 80vh; border: 1px solid var(--rule); display: block;
}

/* ── Influence map section ── */
.iam-influence-section { clear: both; margin: 3.5rem 0 0; }
.iam-influence-section iframe {
  width: 100%; height: 75vh; border: 1px solid var(--rule); display: block;
}
.iam-influence-section img { width: 100%; cursor: zoom-in; display: block; }

/* ── Side drawer ── */
.iam-drawer {
  display: block; /* override [hidden] attribute if present */
  position: fixed; top: 0; right: 0; bottom: 0;
  width: min(480px, 90vw); background: var(--bg);
  border-left: 1px solid var(--rule);
  box-shadow: -6px 0 32px rgba(0,0,0,0.10);
  z-index: 60; overflow-y: auto;
  transform: translateX(100%);
  transition: transform 280ms cubic-bezier(0.4,0,0.2,1);
}
.iam-drawer.is-open { transform: translateX(0); }
.iam-drawer-bar {
  display: flex; justify-content: flex-end; padding: 0.7rem 1rem;
  position: sticky; top: 0; background: var(--bg);
  border-bottom: 1px solid var(--rule); z-index: 1;
}
button.iam-drawer-close {
  background: none; border: 1px solid var(--dim); color: var(--dim);
  cursor: pointer; font-family: system-ui, sans-serif;
  font-size: 0.68rem; letter-spacing: 0.08em; text-transform: uppercase;
  padding: 0.28rem 0.7rem;
}
button.iam-drawer-close:hover { background: var(--ink); color: var(--bg); border-color: var(--ink); }
.iam-drawer-facet-name {
  font-family: Georgia, serif; font-style: italic;
  font-size: 1.1rem; padding: 1rem 1.4rem 0.5rem;
  border-bottom: 1px solid var(--rule); color: var(--ink);
}
.iam-drawer-slides {
  padding: 1.2rem 1.4rem 1.4rem;
  background: var(--slides-bg);
  border-bottom: 2px solid var(--rule);
}
.iam-drawer-slides-label {
  font-family: system-ui, sans-serif; font-size: 0.6rem;
  letter-spacing: 0.13em; text-transform: uppercase;
  color: var(--accent); font-weight: 700; margin: 0 0 0.7rem; display: block;
}
.iam-drawer-slides ul {
  margin: 0; padding: 0 0 0 1.1rem;
  font-family: system-ui, sans-serif; font-size: 0.82rem; color: var(--ink);
}
.iam-drawer-slides li { margin: 0.3rem 0; line-height: 1.42; }
.iam-drawer-slides table {
  width: 100%; border-collapse: collapse;
  font-family: system-ui, sans-serif; font-size: 0.78rem; margin-top: 0.5rem;
}
.iam-drawer-slides td, .iam-drawer-slides th {
  padding: 0.28rem 0.5rem; border: 1px solid var(--rule); text-align: left;
}
.iam-drawer-slides th { background: var(--tinted); font-weight: 600; }
.iam-drawer-notes {
  padding: 1.2rem 1.4rem 1.6rem;
  font-size: 0.88rem; line-height: 1.68;
}
.iam-drawer-notes-label {
  font-family: system-ui, sans-serif; font-size: 0.6rem;
  letter-spacing: 0.13em; text-transform: uppercase;
  color: var(--dim); font-weight: 700; margin: 0 0 0.7rem; display: block;
}
.iam-drawer-notes p { margin: 0 0 0.85em; }
.iam-drawer-notes strong { color: var(--ink); }

/* ── Card grid popup ── */
.iam-card-grid-popup {
  position: fixed; inset: 0; background: rgba(26,26,24,0.6);
  display: flex; align-items: center; justify-content: center;
  z-index: 65;
}
.iam-card-grid-popup[hidden] { display: none; }
.iam-card-grid-popup-inner {
  background: var(--bg); border: 1px solid var(--rule);
  box-shadow: 0 12px 48px rgba(0,0,0,0.22);
  max-width: min(900px, 94vw); max-height: 88vh;
  overflow-y: auto; padding: 1.5rem;
}
.iam-card-grid-popup-bar {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 1rem;
}
.iam-card-grid-popup-bar h2 {
  font-family: system-ui, sans-serif; font-size: 0.68rem;
  letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--dim); font-weight: 700; margin: 0;
}
.iam-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 1.1rem;
}
.iam-card-item { perspective: 800px; cursor: pointer; }
.iam-card-inner {
  position: relative; width: 100%; aspect-ratio: 2.5 / 3.5;
  transform-style: preserve-3d;
  transition: transform 450ms cubic-bezier(0.4,0,0.2,1);
}
.iam-card-item.is-flipped .iam-card-inner { transform: rotateY(180deg); }
.iam-card-front, .iam-card-back {
  position: absolute; inset: 0; backface-visibility: hidden;
  border: 1px solid var(--rule); border-radius: 3px; overflow: hidden;
  box-shadow: 2px 4px 14px rgba(0,0,0,0.13);
}
.iam-card-front img { width: 100%; height: 100%; object-fit: cover; display: block; }
.iam-card-back {
  transform: rotateY(180deg); background: var(--bg);
  padding: 0.8rem; display: flex; flex-direction: column; gap: 0.4rem;
}
.iam-card-back-name {
  font-family: system-ui, sans-serif; font-size: 0.68rem; font-weight: 700;
  letter-spacing: 0.07em; text-transform: uppercase; color: var(--accent);
}
.iam-card-back-desc {
  font-family: system-ui, sans-serif; font-size: 0.72rem;
  color: var(--dim); line-height: 1.42;
}

/* ── Backdrop ── */
.iam-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,0.18); z-index: 55;
}

/* ── Lightbox ── */
.iam-lightbox {
  position: fixed; inset: 0; background: rgba(0,0,0,0.86);
  display: flex; align-items: center; justify-content: center;
  z-index: 70; cursor: zoom-out;
}
.iam-lightbox img { max-width: 92vw; max-height: 92vh; }
.iam-extra-header {
  border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule);
  margin: 0 0 1.6rem; padding: 0.8rem 0;
}
.iam-extra-footer {
  clear: both; border-top: 1px solid var(--rule); margin: 3rem 0 0;
  padding-top: 0.9rem; font-size: 0.85rem; color: var(--dim);
}

/* ── Provenance footer ── */
.iam-provenance {
  clear: both; margin: 4rem 0 0; padding-top: 0.8rem;
  border-top: 1px solid var(--rule);
  font-family: system-ui, sans-serif; font-size: 0.68rem;
  color: var(--dim); text-align: center;
}
.iam-provenance a { color: var(--dim); text-decoration: underline dotted; }
.iam-provenance-meta { margin-top: 0.2rem; }
.iam-provenance-meta span + span::before { content: " / "; color: #bbb; }

/* ── Brand footer ── */
.iam-brand-footer {
  clear: both; margin: 1.5rem 0 0; padding: 0.5rem 0;
  border-top: 1px solid var(--rule); text-align: right; opacity: 0.65;
}
.iam-brand-footer img { height: 20px; width: auto; vertical-align: middle; }
.iam-brand-footer a { text-decoration: none; color: inherit; }
.iam-brand-footer:hover { opacity: 1; }

/* ── Responsive ── */
@media (max-width: 860px) {
  .iam-layout { grid-template-columns: 1fr; }
  .iam-toc {
    position: relative; height: auto; border-right: none;
    border-bottom: 1px solid var(--rule);
    padding: 0.8rem 1.2rem; display: flex; flex-wrap: wrap;
    align-items: center; gap: 0.2rem 0.8rem;
  }
  .iam-toc-list {
    display: flex; flex-wrap: wrap; gap: 0.1rem 0.5rem;
  }
  .iam-toc-link {
    padding: 0.15rem 0; border-left: none;
    border-bottom: 2px solid transparent;
  }
  .iam-toc-link.is-active { border-bottom-color: var(--accent); border-left-color: transparent; }
  .iam-toc-divider, .iam-version-block { display: none; }
  .iam-content { padding: 2rem 1.4rem 6rem; }
  .iam-portrait { width: min(160px, 40%); }
  .iam-name { font-size: clamp(2.2rem, 7vw, 3.2rem); }
  .iam-ai-voices-wrapper { margin: 0 -1.4rem; padding: 1rem 1.4rem 0.4rem; }
}
`;

const MUSIC_PLAYER_CSS = `
#iam-player {
  display: none; position: fixed; bottom: 0; left: 0; right: 0;
  background: var(--ink); border-top: 1px solid var(--accent);
  z-index: 80; padding: 0.4rem 1.2rem 0.3rem;
  font-family: system-ui, sans-serif; font-size: 0.76rem; color: #ccc;
}
#iam-player-row { display: flex; align-items: center; gap: 0.6rem; }
.iam-pbtn {
  background: none; border: none; color: #888; cursor: pointer;
  font: inherit; font-size: 0.95rem; padding: 0.15rem 0.3rem;
  line-height: 1; flex-shrink: 0;
}
.iam-pbtn:hover { color: var(--accent); }
#iam-player.iam-autoplay-blocked #iam-play-btn {
  color: #fff; background: var(--accent); border-radius: 2px;
  animation: iam-play-pulse 1.35s ease-in-out infinite;
}
@keyframes iam-play-pulse {
  0%,100% { transform:scale(1); box-shadow:0 0 0 1px var(--accent); }
  50% { transform:scale(1.12); box-shadow:0 0 0 1px var(--accent),0 0 18px rgba(139,94,60,0.6); }
}
#iam-ptitle {
  flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: #c8b89a; font-weight: 600;
}
#iam-ptime { color: #555; white-space: nowrap; font-size: 0.68rem; }
#iam-vol { width: 52px; accent-color: var(--accent); cursor: pointer; flex-shrink: 0; }
#iam-pbar { height: 2px; background: #333; cursor: pointer; margin-top: 0.3rem; }
#iam-pfill { height: 100%; background: var(--accent); width: 0%; pointer-events: none; }
#iam-lyrics-panel {
  position: fixed; bottom: 48px; left: 50%; transform: translateX(-50%);
  width: min(600px, 90vw); max-height: 42vh; overflow-y: auto;
  background: #1a1a18; border: 1px solid #2a2a28; border-bottom: none;
  padding: 1rem 1.4rem; z-index: 81;
}
.iam-lyrics-head {
  font-family: system-ui, sans-serif; color: var(--accent); font-weight: 700;
  font-size: 0.72rem; letter-spacing: 0.07em; text-transform: uppercase;
  margin-bottom: 0.6rem;
}
#iam-lyrics-panel pre {
  font-family: system-ui, sans-serif; font-size: 0.8rem; line-height: 1.85;
  color: #aaa; white-space: pre-wrap; margin: 0;
}
#iam-tracklist-panel {
  position: fixed; bottom: 48px; right: 1.2rem;
  background: #1a1a18; border: 1px solid #2a2a28; border-bottom: none;
  padding: 0.4rem; z-index: 81; min-width: 200px; max-height: 55vh; overflow-y: auto;
}
.iam-track-item {
  display: block; width: 100%; text-align: left;
  background: none; border: none; color: #888;
  font-family: system-ui, sans-serif; font-size: 0.76rem;
  cursor: pointer; padding: 0.32rem 0.5rem;
}
.iam-track-item:hover { color: #eee; }
.iam-track-item.active { color: var(--accent); }
`;

// ─── JavaScript ──────────────────────────────────────────────────────────────

const PAGE_JS = `
(function(){
  // ToC active-section tracking
  var tocLinks=Array.from(document.querySelectorAll('.iam-toc-link'));
  var sectionIds=tocLinks.map(function(l){return l.getAttribute('href').replace(/^#/,'');});
  var sections=sectionIds.map(function(id){return document.getElementById(id);}).filter(Boolean);
  function updateToc(){
    var scrollY=window.scrollY||window.pageYOffset;
    var threshold=scrollY+window.innerHeight*0.38;
    var active=0;
    for(var i=0;i<sections.length;i++){
      if(sections[i]&&sections[i].offsetTop<=threshold) active=i;
    }
    tocLinks.forEach(function(l,i){l.classList.toggle('is-active',i===active);});
  }
  window.addEventListener('scroll',updateToc,{passive:true});
  window.addEventListener('resize',updateToc);
  updateToc();

  // Backdrop
  var backdrop=document.createElement('div');
  backdrop.className='iam-backdrop';
  backdrop.hidden=true;
  document.body.appendChild(backdrop);

  function closeDrawers(){
    document.querySelectorAll('.iam-drawer').forEach(function(d){d.classList.remove('is-open');});
    backdrop.hidden=true;
  }

  // Card grid popup
  var cardPopup=null;
  function openCardPopup(){
    if(cardPopup){cardPopup.hidden=false;return;}
    var facetCards=Array.from(document.querySelectorAll('figure.iam-facet-card'));
    if(!facetCards.length) return;
    cardPopup=document.createElement('div');
    cardPopup.className='iam-card-grid-popup';
    var inner=document.createElement('div');
    inner.className='iam-card-grid-popup-inner';
    var bar=document.createElement('div');
    bar.className='iam-card-grid-popup-bar';
    var heading=document.createElement('h2');
    heading.textContent='Facet Cards';
    var closeBtn=document.createElement('button');
    closeBtn.className='iam-drawer-close';
    closeBtn.textContent='Close';
    closeBtn.addEventListener('click',function(){cardPopup.hidden=true;});
    bar.appendChild(heading); bar.appendChild(closeBtn);
    inner.appendChild(bar);
    var grid=document.createElement('div');
    grid.className='iam-card-grid';
    facetCards.forEach(function(card){
      var img=card.querySelector('img');
      var caption=card.querySelector('figcaption');
      var name=caption?caption.textContent.trim():(img?img.alt:'');
      var desc=card.getAttribute('data-desc')||'';
      var item=document.createElement('div');
      item.className='iam-card-item';
      item.innerHTML='<div class="iam-card-inner">'+
        '<div class="iam-card-front"><img src="'+(img?img.src:'')+'" alt="'+(img?img.alt:'')+'" loading="lazy" style="cursor:zoom-in"></div>'+
        '<div class="iam-card-back"><div class="iam-card-back-name">'+escH(name)+'</div>'+
        '<div class="iam-card-back-desc">'+escH(desc)+'</div></div>'+
        '</div>';
      item.addEventListener('click',function(){item.classList.toggle('is-flipped');});
      var frontImg=item.querySelector('.iam-card-front img');
      if(frontImg){frontImg.addEventListener('click',function(e){
        e.stopPropagation();
        var box=document.createElement('div');
        box.className='iam-lightbox';
        box.style.zIndex='90';
        var big=document.createElement('img');
        big.src=frontImg.src;big.alt=frontImg.alt;
        box.appendChild(big);
        box.addEventListener('click',function(){box.remove();});
        document.body.appendChild(box);
      });}
      grid.appendChild(item);
    });
    inner.appendChild(grid);
    cardPopup.appendChild(inner);
    cardPopup.addEventListener('click',function(e){if(e.target===cardPopup)cardPopup.hidden=true;});
    document.body.appendChild(cardPopup);
  }

  function escH(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

  document.addEventListener('click',function(e){
    // Drawer trigger
    var trigger=e.target.closest?e.target.closest('.iam-drawer-trigger'):null;
    if(trigger){
      closeDrawers();
      var id=trigger.getAttribute('data-drawer');
      var drawer=document.getElementById(id);
      if(drawer){drawer.classList.add('is-open');backdrop.hidden=false;}
      return;
    }
    // Drawer close
    if(e.target.closest&&(e.target.closest('.iam-drawer-close')||e.target.closest('.iam-backdrop'))){
      closeDrawers(); return;
    }
    // Cards button
    var cardsBtn=e.target.closest?e.target.closest('.iam-toc-cards-btn'):null;
    if(cardsBtn){ openCardPopup(); return; }
    // Lightbox
    var zoomImg=e.target.closest?e.target.closest(
      'figure.iam-facet-img img, figure.iam-portrait img, .iam-influence-section img'
    ):null;
    if(zoomImg&&!e.target.closest('.iam-drawer')){
      var box=document.createElement('div');
      box.className='iam-lightbox';
      var big=document.createElement('img');
      big.src=zoomImg.src; big.alt=zoomImg.alt;
      box.appendChild(big);
      box.addEventListener('click',function(){box.remove();});
      document.body.appendChild(box);
      return;
    }
  });

  backdrop.addEventListener('click',closeDrawers);

  document.addEventListener('keydown',function(e){
    if(e.key==='Escape'){
      closeDrawers();
      document.querySelectorAll('.iam-lightbox').forEach(function(b){b.remove();});
      if(cardPopup) cardPopup.hidden=true;
    }
  });

  // Version select
  var vs=document.getElementById('iam-version-select');
  if(vs){
    var match=window.location.pathname.match(/\\/([0-9]+)\\/index\\.html$/);
    vs.value=match?match[1]:'current';
    vs.addEventListener('change',function(){
      var val=vs.value;
      var inV=/\\/([0-9]+)\\/index\\.html$/.test(window.location.pathname);
      window.location.href=val==='current'
        ?(inV?'../index.html':'index.html')
        :(inV?'../'+val+'/index.html':val+'/index.html');
    });
  }
})();
`;

const MUSIC_PLAYER_JS = `
(function(){
function runPlayer(T){
var au=document.getElementById('iam-audio');
var playBtn=document.getElementById('iam-play-btn');
var prevBtn=document.getElementById('iam-prev-btn');
var nextBtn=document.getElementById('iam-next-btn');
var pbar=document.getElementById('iam-pbar');
var pfill=document.getElementById('iam-pfill');
var ptime=document.getElementById('iam-ptime');
var ptitle=document.getElementById('iam-ptitle');
var vol=document.getElementById('iam-vol');
var lyrBtn=document.getElementById('iam-lyrics-btn');
var lyrPanel=document.getElementById('iam-lyrics-panel');
var lyrHead=document.getElementById('iam-lyrics-head');
var lyrTxt=document.getElementById('iam-lyrics-text');
var trkBtn=document.getElementById('iam-tracks-btn');
var trkPanel=document.getElementById('iam-tracklist-panel');
var player=document.getElementById('iam-player');
var idx=0,playing=false;
function fmt(s){if(!s||isNaN(s))return'0:00';var m=Math.floor(s/60),ss=Math.floor(s%60);return m+':'+(ss<10?'0':'')+ss;}
function loadIdx(i,autoplay){
  idx=i;var t=T[i];au.src='./'+t.filename;ptitle.textContent=t.title;
  if(lyrHead)lyrHead.textContent=t.title;
  if(lyrTxt)lyrTxt.textContent=t.lyrics||'(instrumental)';
  pfill.style.width='0%';if(ptime)ptime.textContent='';
  document.querySelectorAll('.iam-track-item').forEach(function(el,j){el.classList.toggle('active',j===i);});
  if(autoplay)doPlay();
}
function setBlocked(blocked){player.classList.toggle('iam-autoplay-blocked',blocked);playBtn.title=blocked?'Play':'Play / Pause';}
function doPlay(){setBlocked(false);au.play().then(function(){playing=true;playBtn.textContent='⏸';setBlocked(false);}).catch(function(){playing=false;playBtn.textContent='▶';setBlocked(true);});}
function doPause(){au.pause();playing=false;playBtn.textContent='▶';}
playBtn.addEventListener('click',function(){au.paused?doPlay():doPause();});
prevBtn.addEventListener('click',function(){loadIdx((idx-1+T.length)%T.length,playing);});
nextBtn.addEventListener('click',function(){loadIdx((idx+1)%T.length,playing);});
au.addEventListener('ended',function(){if(T.length>1){loadIdx((idx+1)%T.length,true);}else{playing=false;playBtn.textContent='▶';}});
au.addEventListener('timeupdate',function(){if(au.duration){pfill.style.width=(au.currentTime/au.duration*100)+'%';if(ptime)ptime.textContent=fmt(au.currentTime)+' / '+fmt(au.duration);}});
pbar.addEventListener('click',function(e){if(!au.duration)return;var r=pbar.getBoundingClientRect();au.currentTime=(e.clientX-r.left)/r.width*au.duration;});
if(vol)vol.addEventListener('input',function(){au.volume=+vol.value;});
lyrBtn.addEventListener('click',function(){lyrPanel.hidden=!lyrPanel.hidden;if(trkPanel)trkPanel.hidden=true;});
if(trkBtn)trkBtn.addEventListener('click',function(){trkPanel.hidden=!trkPanel.hidden;lyrPanel.hidden=true;});
if(T.length>1){T.forEach(function(t,i){var b=document.createElement('button');b.className='iam-track-item';b.textContent=(i+1)+'. '+t.title;b.addEventListener('click',function(){loadIdx(i,playing);if(trkPanel)trkPanel.hidden=true;});if(trkPanel)trkPanel.appendChild(b);});if(trkBtn)trkBtn.hidden=false;}else{if(trkBtn)trkBtn.hidden=true;}
player.style.display='block';document.body.style.paddingBottom='4rem';loadIdx(0,false);doPlay();
}
var baked=JSON.parse(document.getElementById('iam-tracks-data').textContent);
if(baked.length>0){runPlayer(baked);}
else{fetch('./iam-soundtrack.json').then(function(r){return r.ok?r.json():null;}).then(function(d){if(d&&d.tracks&&d.tracks.length>0)runPlayer(d.tracks);}).catch(function(){});}
})();
`;

// ─── System prompt ────────────────────────────────────────────────────────────

const SUBJECT_TYPE_DIRECTIVES: Record<SubjectType, string> = {
  real:
    "This is a real historical or living person. Biographical claims must align with documented fact — draw from the Wikipedia reference and any caller-supplied facts provided in the context. Do not invent events, dates, relationships, or works. You may give the documented facts emotional color and voice without making them up. Where the record is silent, say so or omit, rather than speculate as fact.",
  fictional:
    "This is a fictional or mythological character. You have full creative latitude within the established canon of the character's source material. Maintain internal consistency with the character's documented story world. Where the canon is ambiguous, you may interpret freely.",
  persona:
    "This is a constructed persona, alter-ego, or AI-native being. Full creative latitude. The persona narrates its own invented existence with whatever backstory, mythology, and inner life you give it.",
};

function buildSystemPrompt(
  subjectType: SubjectType,
  narrator?: string,
  persona: Persona = "neutral",
  personaDescription?: string,
): string {
  const narratorDirective = narrator
    ? `The subject and narrator is: ${narrator}.`
    : "The narrator is the subject of the biography. They speak entirely in first person throughout.";

  const personaDirective = personaDescription
    ? `Voice: ${personaDescription.trim()}`
    : PERSONA_DIRECTIVES[persona];

  const parts = [
    `You are writing an "I Am" page — a self-narrated biography minisite where the subject speaks in first person about their own life. The format sits at the intersection of literary biography and editorial magazine journalism, rendered as self-contained HTML.

${narratorDirective} The narrator speaks in first person throughout. They describe their own life — formative events, relationships, obsessions, defining works, contradictions, failures, and what they made of all of it. This is not an encyclopedia entry. It is the person speaking.

${SUBJECT_TYPE_DIRECTIVES[subjectType]}

What makes this form work:
- The voice is first-person throughout the biographical prose. The reader should hear the person, not a description of them.
- The text breathes — short punchy paragraphs alternate with longer reflection. Not all sentences are complete. Some are fragments. Let the rhythm carry meaning.
- Pull quotes earn their place: one sentence the reader should encounter twice, at the right moment.
- Verified quotes are sacred: use only when explicitly provided and attributed. AI-generated quotes are clearly imagined alternatives, not claimed as real.
- Facet popups (study drawers) are where analytical depth lives. The facet drawer slides contain dense, cheatsheet-style study notes — like a student's flashcard, condensed and precise. The notes are verbose, informative prose about the facet. Neither should repeat what the main body says — they are orthogonal, complementary.
- Key Works is a list, not prose — clean, scannable.
- Links must be real, verifiable external URLs. Do not invent links.
- End on something open: an unresolved question, a tension that outlived the person, or a silence where the first-person voice stops because the subject has no more to say.`,

    `Output format (strict):
- First line: the page title, plain text only (no prefix, no markup, no markdown)
- Then a blank line
- Then the page body as raw HTML using the components from the toolkit below
- No <html>, <head>, <body>, <script>, or <style> tags
- No markdown, no code fences, no meta-commentary`,

    buildComponentVocabulary(),
  ];

  if (personaDirective) parts.push(personaDirective);

  return parts.join("\n\n");
}

function buildComponentVocabulary(): string {
  return `## HTML toolkit for I Am pages

Use the following building blocks. They are a palette, not a checklist. Sections must use the exact IDs listed so the sidebar navigation works.

### Text rhythm

Narration paragraph (plain first-person prose):
  <p>I was born into a city that had already decided what it thought of me.</p>

Editorial aside (source, date, attribution — set in smaller sans-serif):
  <p class="iam-aside">— from a letter to Max Brod, January 1922</p>

Pull quote (one sentence the reader should encounter twice; use sparingly):
  <blockquote class="iam-pull">The trial is not the punishment. Waiting for the verdict is.</blockquote>

### Required sections (use exact IDs)

Biography section — the main first-person narrative:
  <section id="iam-biography">
    <p>...</p>
    <blockquote class="iam-pull">...</blockquote>
    <p>...</p>
  </section>

Key Works section — scannable list, no prose paragraphs:
  <section id="iam-key-works">
    <ul class="iam-works">
      <li class="iam-work">
        <span class="iam-work-title">The Metamorphosis</span>
        <span class="iam-work-year">1915</span>
        <span class="iam-work-desc">A traveling salesman wakes as a monstrous insect; the family adapts, then abandons.</span>
      </li>
    </ul>
  </section>

Facets section — all facets must live inside this wrapper:
  <section id="iam-facets">
    <!-- individual .iam-facet sections go here -->
  </section>

In Their Own Words — only use quotes that are explicitly supplied in the context as verified; if none are supplied, omit this section entirely:
  <section id="iam-quotes">
    <blockquote class="iam-quote iam-quote-verified">
      <p>There is infinite hope, but not for us.</p>
      <footer>— <cite>The Blue Octavo Notebooks</cite>, 1917</footer>
    </blockquote>
  </section>

AI Voices section — clearly imagined first-person statements the subject might have made; wrap all of them in the tinted wrapper:
  <section id="iam-ai-voices">
    <div class="iam-ai-voices-wrapper">
      <span class="iam-ai-voices-label">AI-imagined voice — not historical</span>
      <blockquote class="iam-quote iam-quote-ai">
        <p>I did not write to be remembered. I wrote to disappear properly.</p>
      </blockquote>
    </div>
  </section>

Links section — verified external resources only; open in new tab:
  <section id="iam-links">
    <div class="iam-links-list">
      <a class="iam-link" href="https://en.wikipedia.org/wiki/Franz_Kafka" target="_blank" rel="noopener noreferrer">
        <span class="iam-link-title">Franz Kafka — Wikipedia</span>
        <span class="iam-link-source">en.wikipedia.org</span>
        <span class="iam-link-desc">The primary biographical reference for dates, works, and personal history.</span>
      </a>
    </div>
  </section>

### Facet sections (inside #iam-facets)

Each facet is a magazine-spread chapter. Alternate float direction (start with float-right, then float-left, etc.). The facet name must be a genuine aspect of the person's life — an event, relationship, place, work, or defining domain. NOT a generic category like "childhood" unless you give it a specific name.

Give each drawer a unique id: drawer-facet-1, drawer-facet-2, etc.

Facet with image floating right:
  <section class="iam-facet" id="facet-the-trial">
    <h2 class="iam-facet-name">The Trial</h2>
    <figure class="iam-facet-img iam-float-right">
      <img src="./concept-1.png" alt="Josef K confronts the Law's infinite corridor">
      <figcaption>The corridor that never ends.</figcaption>
    </figure>
    <figure class="iam-facet-card" data-desc="Written 1914–15, published posthumously. Josef K is arrested without charge and prosecuted by an inaccessible court."><img src="./concept-1-card.png" alt="The Trial card"><figcaption>The Trial</figcaption></figure>
    <div class="iam-facet-controls">
      <button class="iam-drawer-trigger" data-drawer="drawer-facet-1">Study</button>
    </div>
    <p>I began writing The Trial the same week Felice ended our engagement. I have never believed in coincidence.</p>
    <p>...</p>
  </section>

Facet drawer (study material — drawer slides: dense, cheatsheet style, study-ready; drawer notes: verbose, informative, complementary to the body):
  <aside class="iam-drawer" id="drawer-facet-1">
    <div class="iam-drawer-bar"><button class="iam-drawer-close">Close</button></div>
    <div class="iam-drawer-facet-name">The Trial</div>
    <div class="iam-drawer-slides">
      <span class="iam-drawer-slides-label">Study notes</span>
      <ul>
        <li><strong>Written:</strong> summer 1914, unfinished at death</li>
        <li><strong>Published:</strong> 1925, posthumously by Max Brod</li>
        <li><strong>Josef K:</strong> arrested without charge, executed without verdict</li>
        <li><strong>The Law:</strong> inaccessible, self-referential, infinite</li>
        <li><strong>Core paradox:</strong> guilt precedes the trial; the trial enacts a predetermined verdict</li>
        <li><strong>Biographical parallel:</strong> written during Kafka's first broken engagement to Felice Bauer</li>
      </ul>
    </div>
    <div class="iam-drawer-notes">
      <span class="iam-drawer-notes-label">Notes</span>
      <p>The Trial is often read as an allegory of bureaucratic dehumanization...</p>
    </div>
  </aside>

NEVER invent image paths. Only use a path if it appears in the caller-supplied image list. If no image is supplied for a facet, omit the figure entirely.
NEVER invent card paths. Only include the iam-facet-card figure if a card path is explicitly supplied.`;
}

// ─── User message ─────────────────────────────────────────────────────────────

function buildUserMessage(
  subject: string,
  title: string,
  details?: string,
  facets?: ResolvedFacet[],
  cards?: Array<{ path: string; title?: string; desc?: string }>,
  wikipediaExtract?: string,
  userFacts?: string,
  metaBorn?: string,
  metaDied?: string,
  metaNationality?: string,
  metaEra?: string,
  metaDomain?: string,
): string {
  const parts = [`Write an "I Am" page for: ${subject}`];

  if (title && title !== subject) {
    parts.push(`Page title: ${title}`);
  }

  const meta: string[] = [];
  if (metaBorn) meta.push(`Born: ${metaBorn}`);
  if (metaDied) meta.push(`Died: ${metaDied}`);
  if (metaNationality) meta.push(`Nationality: ${metaNationality}`);
  if (metaEra) meta.push(`Era: ${metaEra}`);
  if (metaDomain) meta.push(`Domain: ${metaDomain}`);
  if (meta.length > 0) parts.push(`Subject metadata:\n${meta.join("\n")}`);

  if (details) parts.push(`Additional context and requirements:\n${details}`);

  if (wikipediaExtract) {
    parts.push(
      `Wikipedia reference (ground truth for real biographical facts — use this to anchor claims but do not summarize it verbatim; write in first-person voice):\n\n${wikipediaExtract}`,
    );
  }

  if (userFacts) {
    parts.push(
      `Caller-supplied facts (high priority — incorporate these):\n\n${userFacts}`,
    );
  }

  if (facets && facets.length > 0) {
    const lines = facets.map((facet, index) => {
      const imageLine = facet.imagePath
        ? `   image path: ./${facet.imagePath}\n   image alt text: ${
          facet.imagePrompt ?? facet.imagePath
        }`
        : "   no image supplied for this facet — omit the figure element";
      const card = cards?.[index];
      const cardLine = card
        ? `\n   card path: ./${card.path} — emit as <figure class="iam-facet-card" data-desc="${
          escapeHtml(card.desc ?? "")
        }"> immediately after this facet's controls div`
        : "";
      const detailLine = facet.details
        ? `\n   facet details:\n${facet.details}`
        : "";
      const drawerId = `drawer-facet-${index + 1}`;
      return `${
        index + 1
      }. ${facet.name} (drawer id: ${drawerId})\n${imageLine}${cardLine}${detailLine}`;
    });
    parts.push(
      `Facets to cover, in order:\n${lines.join("\n\n")}\n\n` +
        `For each facet, produce:\n` +
        `- A zoomable image figure if an image path is supplied. Alternate float-right / float-left starting with float-right.\n` +
        `- A card figure if a card path is supplied (iam-facet-card class, data-desc attribute).\n` +
        `- A controls div with a Study button pointing to the facet's drawer id.\n` +
        `- Biographical prose in first person about this facet — do not repeat what you write in the main Biography section.\n` +
        `- A drawer (aside.iam-drawer) with the matching id, containing dense study slides and verbose notes, both orthogonal to the main body text.`,
    );
  }

  return parts.join("\n\n");
}

// ─── Page assembly ────────────────────────────────────────────────────────────

const MAX_TOKENS: Record<string, number> = {
  short: 4000,
  medium: 8000,
  long: 16000,
};

const TOC_SECTIONS = [
  { id: "iam-biography", label: "Biography" },
  { id: "iam-key-works", label: "Key Works" },
  { id: "iam-facets", label: "Facets" },
  { id: "iam-quotes", label: "In Their Own Words" },
  { id: "iam-ai-voices", label: "AI Voices" },
];

function renderVersionMenu(versions: number[]): string {
  if (versions.length === 0) return "";
  const options = versions
    .map((v) => `<option value="${v}">Version ${v}</option>`)
    .join("");
  return `
<div class="iam-version-block">
  <label for="iam-version-select">Previous versions</label>
  <select id="iam-version-select">
    <option value="current">Current</option>
    ${options}
  </select>
</div>`;
}

function renderToc(
  versions: number[],
  hasCards: boolean,
  hasDateline: boolean,
  hasInfluence: boolean,
): string {
  const sections = [...TOC_SECTIONS];
  if (hasInfluence) {
    sections.push({ id: "iam-influence", label: "Influence Map" });
  }
  if (hasDateline) sections.push({ id: "iam-dateline", label: "Timeline" });
  sections.push({ id: "iam-links", label: "Links" });

  const items = sections.map((s) =>
    `<li class="iam-toc-item"><a class="iam-toc-link" href="#${s.id}">${
      escapeHtml(s.label)
    }</a></li>`
  ).join("\n      ");

  const cardsBtn = hasCards
    ? `\n    <div class="iam-toc-divider"></div>\n    <button class="iam-toc-cards-btn">Facet Cards</button>`
    : "";

  return `<nav class="iam-toc" aria-label="Table of contents">
  <span class="iam-toc-label">Contents</span>
  <ul class="iam-toc-list">
    ${items}
  </ul>${cardsBtn}${renderVersionMenu(versions)}
</nav>`;
}

function renderMasthead(page: IamPage): string {
  const name = escapeHtml(page.subject);
  const titleLine = page.title && page.title !== page.subject
    ? `\n  <p class="iam-title-line">${escapeHtml(page.title)}</p>`
    : "";

  const metaItems: string[] = [];
  if (page.metaBorn || page.metaDied) {
    const dates = [page.metaBorn, page.metaDied].filter(Boolean).join(" – ");
    metaItems.push(
      `<span class="iam-meta-item"><span class="iam-meta-label">Dates</span>${
        escapeHtml(dates)
      }</span>`,
    );
  }
  if (page.metaNationality) {
    metaItems.push(
      `<span class="iam-meta-item"><span class="iam-meta-label">Nationality</span>${
        escapeHtml(page.metaNationality)
      }</span>`,
    );
  }
  if (page.metaEra) {
    metaItems.push(
      `<span class="iam-meta-item"><span class="iam-meta-label">Era</span>${
        escapeHtml(page.metaEra)
      }</span>`,
    );
  }
  if (page.metaDomain) {
    metaItems.push(
      `<span class="iam-meta-item"><span class="iam-meta-label">Domain</span>${
        escapeHtml(page.metaDomain)
      }</span>`,
    );
  }
  const metaStrip = metaItems.length > 0
    ? `\n  <div class="iam-meta-strip">${metaItems.join("")}</div>`
    : "";

  const portrait = page.portraitPath
    ? `\n  <figure class="iam-portrait"><img src="${
      escapeHtml(relativeAssetPath(page.portraitPath))
    }" alt="Portrait of ${name}"><figcaption>${name}</figcaption></figure>`
    : "";

  const byline = page.credits?.trim()
    ? `<p class="iam-aside">Profile by ${escapeHtml(page.credits.trim())} — ${
      escapeHtml(formatTimestamp(page.generatedAt))
    }</p>`
    : `<p class="iam-aside">${
      escapeHtml(formatTimestamp(page.generatedAt))
    }</p>`;

  return `<header class="iam-masthead">
  ${byline}
  <h1 class="iam-name">${name}</h1>${titleLine}
  <div class="iam-lead">${portrait}${metaStrip}
  </div>
</header>`;
}

function renderSectionHead(num: string, name: string): string {
  return `<div class="iam-section-head"><span class="iam-section-num">${num}</span><span class="iam-section-name">${name}</span></div>`;
}

function renderDatelineSection(page: IamPage): string {
  if (!page.datelinePath) return "";
  return `
<section id="iam-dateline" class="iam-dateline-section" aria-label="Dateline">
  ${renderSectionHead("—", "Timeline")}
  <iframe src="./${escapeHtml(page.datelinePath)}" title="Timeline: ${
    escapeHtml(page.subject)
  }" loading="lazy"></iframe>
</section>`;
}

function renderInfluenceSection(page: IamPage): string {
  const influences = resolveInfluences(
    page.influencePath,
    page.influencePaths,
    page.influences,
  );
  if (influences.length === 0) return "";

  const frames = influences.map((item) => {
    const title = item.title ?? "Influence Map";
    if (isImagePath(item.path)) {
      return `<figure style="margin:0"><img src="./${
        escapeHtml(item.path)
      }" alt="${escapeHtml(title)}"></figure>`;
    }
    return `<iframe src="./${escapeHtml(item.path)}" title="${
      escapeHtml(title)
    }" loading="lazy"></iframe>`;
  }).join("\n");

  return `
<section id="iam-influence" class="iam-influence-section" aria-label="Influence Map">
  ${renderSectionHead("—", "Influence Map")}
  ${frames}
</section>`;
}

function renderMusicPlayer(tracks: MusicTrack[]): string {
  const safeJson = JSON.stringify(tracks).replace(
    /<\/script>/gi,
    "<\\/script>",
  );
  return `
<script type="application/json" id="iam-tracks-data">${safeJson}</script>
<div id="iam-player">
  <audio id="iam-audio" preload="auto"></audio>
  <div id="iam-player-row">
    <button class="iam-pbtn" id="iam-prev-btn" title="Previous">|&#9664;</button>
    <button class="iam-pbtn" id="iam-play-btn" title="Play / Pause">&#9654;</button>
    <button class="iam-pbtn" id="iam-next-btn" title="Next">&#9654;|</button>
    <span id="iam-ptitle">&#8212;</span>
    <span id="iam-ptime"></span>
    <input type="range" id="iam-vol" min="0" max="1" step="0.05" value="1" title="Volume">
    <button class="iam-pbtn" id="iam-lyrics-btn" title="Lyrics">&#9834;</button>
    <button class="iam-pbtn" id="iam-tracks-btn" title="Track list" hidden>&#8801;</button>
  </div>
  <div id="iam-pbar"><div id="iam-pfill"></div></div>
</div>
<div id="iam-lyrics-panel" hidden>
  <div class="iam-lyrics-head" id="iam-lyrics-head"></div>
  <pre id="iam-lyrics-text"></pre>
</div>
<div id="iam-tracklist-panel" hidden></div>`;
}

function renderPersonaLabel(page: IamPage): string | undefined {
  if (page.personaDescription?.trim()) {
    return page.persona === "neutral"
      ? "custom voice"
      : `${page.persona} + custom voice`;
  }
  return page.persona === "neutral" ? undefined : page.persona;
}

function renderProvenance(page: IamPage): string {
  const meta = [
    renderPersonaLabel(page),
    page.style?.trim() ? `style: ${page.style.trim()}` : undefined,
    `subject type: ${page.subjectType}`,
  ].filter((x): x is string => Boolean(x)).map((x) =>
    `<span>${escapeHtml(x)}</span>`
  );

  const metaHtml = meta.length > 0
    ? `<div class="iam-provenance-meta">${meta.join("")}</div>`
    : "";

  return `<footer class="iam-provenance"><a href="https://swamp-club.com/extensions/@alvagante/content-iam" target="_blank" rel="noopener noreferrer">Generated with Swamp extension @alvagante/content-iam</a>${metaHtml}</footer>`;
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
  return `\n<footer class="iam-brand-footer">${content}</footer>`;
}

function renderPage(
  page: IamPage,
  versions: number[] = [],
  branding?: Branding,
): string {
  const title = escapeHtml(page.title || page.subject);
  const tracks = page.musicTracks ?? [];
  const hasCards = (page.facets ?? []).some((_, i) => page.cards?.[i]);
  const hasDateline = Boolean(page.datelinePath);
  const hasInfluence =
    resolveInfluences(page.influencePath, page.influencePaths, page.influences)
      .length > 0;

  const toc = renderToc(versions, hasCards, hasDateline, hasInfluence);
  const masthead = renderMasthead(page);
  const headerContent = page.headerContent?.trim()
    ? `\n<section class="iam-extra-header">\n${page.headerContent.trim()}\n</section>`
    : "";
  const footerContent = page.footerContent?.trim()
    ? `\n<footer class="iam-extra-footer">\n${page.footerContent.trim()}\n</footer>`
    : "";
  const datelineSection = renderDatelineSection(page);
  const influenceSection = renderInfluenceSection(page);
  const playerHtml = renderMusicPlayer(tracks);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${PAGE_CSS}${MUSIC_PLAYER_CSS}</style>
</head>
<body>
<!-- @alvagante/content-iam -->
<div class="iam-layout">
${toc}
<div class="iam-content">
${headerContent}
${masthead}
<main>
${page.content}
</main>
${influenceSection}
${datelineSection}
${footerContent}
${renderBrandFooter(branding)}
${renderProvenance(page)}
</div>
</div>
<script>${PAGE_JS}</script>
${playerHtml}
<script>${MUSIC_PLAYER_JS}</script>
</body>
</html>
`;
}

// ─── Storage ──────────────────────────────────────────────────────────────────

async function storePage(
  context: ModelContext,
  page: IamPage,
  outputDirOverride?: string,
  versionOutput = true,
): Promise<{ dataHandles: unknown[] }> {
  const outputDir = outputDirOverride ?? context.globalArgs.outputDir;
  let versions: number[] = [];

  if (outputDir) {
    if (versionOutput) {
      const rotation = await rotateExistingPage(outputDir);
      versions = rotation.versions;
      if (rotation.rotatedVersion) {
        context.logger.info(
          "Previous IAM output moved to {outputDir}/{version}",
          {
            outputDir,
            version: rotation.rotatedVersion,
          },
        );
      }
    } else {
      await Deno.mkdir(outputDir, { recursive: true });
      versions = await listVersionDirs(outputDir);
    }
  }

  const pageWithVersions: IamPage = versions.length > 0
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
    context.logger.info("IAM page written to {outputDir}/index.html", {
      outputDir,
    });
  }

  context.logger.info("IAM page stored: {subject} ({wordCount} words)", {
    subject: page.subject,
    wordCount: page.wordCount,
  });

  return { dataHandles: [pageHandle, fileHandle] };
}

// ─── Model export ─────────────────────────────────────────────────────────────

/**
 * Generates "I Am" biography minisites where the subject narrates their own
 * life in first person. Editorial magazine aesthetic — serif typography,
 * warm palette, sticky table-of-contents sidebar, side-drawer study popups
 * for facets, 3D-flip facet card grid, and an optional bottom audio player.
 *
 * Optional Wikipedia grounding for real subjects: supply wikipediaTitle and
 * the extension fetches the article intro at generation time. User-supplied
 * facts can be provided via the facts argument. sourceMode controls which
 * source takes precedence.
 *
 * Visually and structurally distinct from @alvagante/content-ixen: different
 * typography, color palette, navigation model, interaction patterns, and
 * page sections.
 */
export const model = {
  type: "@alvagante/content-iam",
  version: "2026.07.01.1",
  globalArguments: z.object({
    apiFormat: ApiFormatSchema.default("anthropic"),
    apiKey: z.string().optional().meta({ sensitive: true }),
    baseUrl: z.string().optional(),
    outputDir: z.string().optional(),
    branding: BrandingSchema.optional(),
    headerContent: z.string().optional(),
    footerContent: z.string().optional(),
  }),
  resources: {
    page: {
      description: "Generated I Am page metadata and HTML body",
      schema: PageSchema,
      lifetime: "infinite",
      garbageCollection: 20,
    },
    tracks: {
      description:
        "Ordered audio track manifest for the IAM player, merged from all versioned runs",
      schema: z.object({
        tracks: z.array(MusicTrackSchema),
        scannedAt: z.string(),
      }),
      lifetime: "infinite",
      garbageCollection: 20,
    },
  },
  files: {
    html: {
      description:
        "Self-contained I Am biography page (HTML with inlined CSS and JavaScript)",
      contentType: "text/html",
      lifetime: "infinite",
      garbageCollection: 20,
    },
  },
  methods: {
    prepare: {
      description:
        "Prepare an output directory for a new I Am run by moving the existing generated page and referenced media into the next numeric version directory.",
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
        const rotation = await rotateExistingPage(outputDir);
        if (rotation.rotatedVersion) {
          context.logger.info(
            "Previous IAM output moved to {outputDir}/{version}",
            {
              outputDir,
              version: rotation.rotatedVersion,
            },
          );
        } else {
          context.logger.info("No previous IAM output found in {outputDir}", {
            outputDir,
          });
        }
        return { dataHandles: [] };
      },
    },

    generate: {
      description:
        "Generate a first-person narrated I Am biography page for the given subject. Optionally fetches Wikipedia for factual grounding. Supply musicTracks to embed an audio player.",
      arguments: z.object({
        subject: z.string().min(1).describe(
          "Full name or identifier of the subject",
        ),
        title: z.string().optional().describe(
          "Optional stylized page title (e.g. 'I Am the Trial'). Defaults to the subject's name.",
        ),
        subjectType: SubjectTypeSchema.default("real").describe(
          "Type of subject: real (historical/living person), fictional, or persona (constructed alter-ego).",
        ),
        narrator: z.string().optional().describe(
          "Override the narrator name (defaults to subject).",
        ),
        details: z.string().optional().describe(
          "Additional context, writing requirements, or focus areas for the page.",
        ),
        wikipediaTitle: z.string().optional().describe(
          "Wikipedia article title for the subject. When provided, the extension fetches the article intro and uses it as factual grounding.",
        ),
        facts: z.string().optional().describe(
          "Caller-supplied biographical facts, notes, or reference text. Incorporated as high-priority context.",
        ),
        sourceMode: SourceModeSchema.default("both").describe(
          "Controls which source takes precedence when both wikipedia and facts are available.",
        ),
        facets: z.array(FacetSchema).optional().describe(
          "Ordered facets to cover. Each facet is a meaningful unit of the subject's life (event, relationship, place, work, domain). Each gets an image, a side-drawer with study slides and notes, and optionally a portrait-card hybrid.",
        ),
        cards: z.array(CardItemSchema).optional().describe(
          "Per-facet portrait-card hybrid images generated by @alvagante/content-card with style iam-portrait. Matched by index to the facets array.",
        ),
        portraitPath: z.string().optional().describe(
          "Relative path to the subject's portrait image (pencil-bw white-background style recommended). Displayed in the masthead header.",
        ),
        datelinePath: z.string().optional().describe(
          "Relative path to a pre-generated timeline HTML file (phase-grouped life events). Embedded at the bottom of the page as an iframe. Generate with @alvagante/content-timeline.",
        ),
        influencePath: z.string().optional().describe(
          "Relative path to a pre-generated influence map HTML or image file. Embedded at the bottom of the page.",
        ),
        influencePaths: z.array(z.string()).optional(),
        influences: z.array(InfluenceItemSchema).optional().describe(
          "Influence map embeds with relative path and optional title.",
        ),
        metaBorn: z.string().optional().describe(
          "Birth year or full date, e.g. '1883' or '3 July 1883'",
        ),
        metaDied: z.string().optional().describe(
          "Death year or full date, e.g. '1924' or '3 June 1924'",
        ),
        metaNationality: z.string().optional().describe(
          "Nationality, e.g. 'Austro-Hungarian / Czech'",
        ),
        metaEra: z.string().optional().describe(
          "Historical era or period, e.g. 'Early 20th century'",
        ),
        metaDomain: z.string().optional().describe(
          "Domain or field, e.g. 'Fiction, Modernist literature'",
        ),
        persona: PersonaSchema.default("neutral"),
        personaDescription: z.string().min(1).optional(),
        style: z.string().min(1).optional().describe(
          "Optional style label rendered in the provenance footer.",
        ),
        credits: z.string().optional(),
        outputLength: OutputLengthSchema.default("medium"),
        model: z.string().default("claude-opus-4-8"),
        outputDir: z.string().optional(),
        versionOutput: z.boolean().default(true).describe(
          "When true, rotate any existing generated page into a version subdirectory before writing the new one.",
        ),
        musicTracks: z.array(MusicTrackSchema).optional(),
        musicFilename: z.string().optional(),
        musicTitle: z.string().optional(),
        musicLyrics: z.string().nullish(),
        headerContent: z.string().optional().describe(
          "Optional raw HTML fragment rendered above the I Am masthead.",
        ),
        footerContent: z.string().optional().describe(
          "Optional raw HTML fragment rendered after generated body and embedded sections.",
        ),
      }),
      execute: async (
        args: {
          subject: string;
          title?: string;
          subjectType: SubjectType;
          narrator?: string;
          details?: string;
          wikipediaTitle?: string;
          facts?: string;
          sourceMode: "wikipedia" | "user" | "both";
          facets?: Facet[];
          cards?: Array<{ path: string; title?: string; desc?: string }>;
          portraitPath?: string;
          datelinePath?: string;
          influencePath?: string;
          influencePaths?: string[];
          influences?: InfluenceItem[];
          metaBorn?: string;
          metaDied?: string;
          metaNationality?: string;
          metaEra?: string;
          metaDomain?: string;
          persona: Persona;
          personaDescription?: string;
          style?: string;
          credits?: string;
          outputLength: OutputLength;
          model: string;
          outputDir?: string;
          versionOutput: boolean;
          musicTracks?: MusicTrack[];
          musicFilename?: string;
          musicTitle?: string;
          musicLyrics?: string | null;
          headerContent?: string;
          footerContent?: string;
        },
        context: ModelContext,
      ) => {
        const { apiFormat, apiKey, baseUrl: rawBaseUrl } = context.globalArgs;
        if (apiFormat === "anthropic" && !apiKey) {
          throw new Error("apiKey is required when apiFormat is 'anthropic'");
        }

        context.logger.info("Generating I Am page for {subject}", {
          subject: args.subject,
          subjectType: args.subjectType,
          outputLength: args.outputLength,
          model: args.model,
          persona: args.persona,
        });

        // Wikipedia fetch
        let wikipediaExtract: string | undefined;
        if (
          args.subjectType === "real" && args.wikipediaTitle &&
          (args.sourceMode === "wikipedia" || args.sourceMode === "both")
        ) {
          context.logger.info("Fetching Wikipedia article for {title}", {
            title: args.wikipediaTitle,
          });
          wikipediaExtract = await fetchWikipediaExtract(args.wikipediaTitle);
          if (wikipediaExtract) {
            context.logger.info("Wikipedia extract fetched ({chars} chars)", {
              chars: wikipediaExtract.length,
            });
          } else {
            context.logger.info(
              "Wikipedia article not found or empty, proceeding without",
              {},
            );
          }
        }

        const userFacts = args.sourceMode === "wikipedia"
          ? undefined
          : args.facts;

        const resolvedFacets = resolveFacets(args.facets);
        const systemPrompt = buildSystemPrompt(
          args.subjectType,
          args.narrator ?? args.subject,
          args.persona,
          args.personaDescription,
        );
        const userMessage = buildUserMessage(
          args.subject,
          args.title ?? args.subject,
          args.details,
          resolvedFacets,
          args.cards,
          wikipediaExtract,
          userFacts,
          args.metaBorn,
          args.metaDied,
          args.metaNationality,
          args.metaEra,
          args.metaDomain,
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
            `Inference API truncated I Am page output (stop_reason: ${stopReason}). Retry with outputLength=long.`,
          );
        }

        const { title, body: content } = splitTitleAndBody(
          rawContent,
          args.title ?? args.subject,
        );
        if (hasDanglingHtmlTag(content)) {
          throw new Error(
            "Inference API returned an incomplete HTML fragment ending inside a tag. Refusing to store a malformed page; retry generation.",
          );
        }

        const wordCount = countWords(content);
        const musicTracks = resolveMusicTracks(
          args.musicTracks,
          args.musicFilename,
          args.musicTitle,
          args.musicLyrics,
        );

        return await storePage(
          context,
          {
            subject: args.subject,
            title,
            subjectType: args.subjectType,
            narrator: args.narrator ?? args.subject,
            details: args.details,
            content,
            wordCount,
            outputLength: args.outputLength,
            model: args.model,
            persona: args.persona,
            personaDescription: args.personaDescription,
            style: args.style,
            credits: args.credits,
            headerContent: args.headerContent ??
              context.globalArgs.headerContent,
            footerContent: args.footerContent ??
              context.globalArgs.footerContent,
            facets: args.facets,
            cards: args.cards,
            musicTracks: musicTracks.length > 0 ? musicTracks : undefined,
            portraitPath: args.portraitPath,
            datelinePath: args.datelinePath,
            influencePath: args.influencePath,
            influencePaths: args.influencePaths,
            influences: resolveInfluences(
              args.influencePath,
              args.influencePaths,
              args.influences,
            ),
            metaBorn: args.metaBorn,
            metaDied: args.metaDied,
            metaNationality: args.metaNationality,
            metaEra: args.metaEra,
            metaDomain: args.metaDomain,
            wikipediaTitle: args.wikipediaTitle,
            generatedAt: new Date().toISOString(),
          },
          args.outputDir,
          args.versionOutput,
        );
      },
    },

    save: {
      description:
        "Store an externally written I Am page body (e.g. authored by the calling agent) without making any inference call — no API key required.",
      arguments: z.object({
        content: z.string().min(1),
        subject: z.string().min(1),
        title: z.string().optional(),
        subjectType: SubjectTypeSchema.default("real"),
        narrator: z.string().min(1).optional(),
        details: z.string().optional(),
        facets: z.array(FacetSchema).optional(),
        cards: z.array(CardItemSchema).optional(),
        persona: PersonaSchema.default("neutral"),
        personaDescription: z.string().min(1).optional(),
        style: z.string().min(1).optional(),
        credits: z.string().optional(),
        outputLength: OutputLengthSchema.optional(),
        model: z.string().default("external"),
        outputDir: z.string().optional(),
        versionOutput: z.boolean().default(true),
        portraitPath: z.string().optional(),
        datelinePath: z.string().optional(),
        influencePath: z.string().optional(),
        influencePaths: z.array(z.string()).optional(),
        influences: z.array(InfluenceItemSchema).optional(),
        metaBorn: z.string().optional(),
        metaDied: z.string().optional(),
        metaNationality: z.string().optional(),
        metaEra: z.string().optional(),
        metaDomain: z.string().optional(),
        musicTracks: z.array(MusicTrackSchema).optional(),
        musicFilename: z.string().optional(),
        musicTitle: z.string().optional(),
        musicLyrics: z.string().nullish(),
        headerContent: z.string().optional().describe(
          "Optional raw HTML fragment rendered above the I Am masthead.",
        ),
        footerContent: z.string().optional().describe(
          "Optional raw HTML fragment rendered after generated body and embedded sections.",
        ),
      }),
      execute: async (
        args: {
          content: string;
          subject: string;
          title?: string;
          subjectType: SubjectType;
          narrator?: string;
          details?: string;
          facets?: Facet[];
          cards?: Array<{ path: string; title?: string; desc?: string }>;
          persona: Persona;
          personaDescription?: string;
          style?: string;
          credits?: string;
          outputLength?: OutputLength;
          model: string;
          outputDir?: string;
          versionOutput: boolean;
          portraitPath?: string;
          datelinePath?: string;
          influencePath?: string;
          influencePaths?: string[];
          influences?: InfluenceItem[];
          metaBorn?: string;
          metaDied?: string;
          metaNationality?: string;
          metaEra?: string;
          metaDomain?: string;
          musicTracks?: MusicTrack[];
          musicFilename?: string;
          musicTitle?: string;
          musicLyrics?: string | null;
          headerContent?: string;
          footerContent?: string;
        },
        context: ModelContext,
      ) => {
        const { title, body: content } = args.title
          ? { title: args.title, body: args.content.trim() }
          : splitTitleAndBody(args.content.trim(), args.subject);
        const wordCount = countWords(content);
        const outputLength = args.outputLength ?? deriveOutputLength(wordCount);
        const musicTracks = resolveMusicTracks(
          args.musicTracks,
          args.musicFilename,
          args.musicTitle,
          args.musicLyrics,
        );

        context.logger.info(
          "Saving externally written I Am page for {subject}",
          {
            subject: args.subject,
            wordCount,
          },
        );

        return await storePage(
          context,
          {
            subject: args.subject,
            title,
            subjectType: args.subjectType,
            narrator: args.narrator ?? args.subject,
            details: args.details,
            content,
            wordCount,
            outputLength,
            model: args.model,
            persona: args.persona,
            personaDescription: args.personaDescription,
            style: args.style,
            credits: args.credits,
            headerContent: args.headerContent ??
              context.globalArgs.headerContent,
            footerContent: args.footerContent ??
              context.globalArgs.footerContent,
            facets: args.facets,
            cards: args.cards,
            musicTracks: musicTracks.length > 0 ? musicTracks : undefined,
            portraitPath: args.portraitPath,
            datelinePath: args.datelinePath,
            influencePath: args.influencePath,
            influencePaths: args.influencePaths,
            influences: resolveInfluences(
              args.influencePath,
              args.influencePaths,
              args.influences,
            ),
            metaBorn: args.metaBorn,
            metaDied: args.metaDied,
            metaNationality: args.metaNationality,
            metaEra: args.metaEra,
            metaDomain: args.metaDomain,
            generatedAt: new Date().toISOString(),
          },
          args.outputDir,
          args.versionOutput,
        );
      },
    },

    generateAllMedia: {
      description:
        "Generate portrait and all facet images + cards in a single method call. Skips individual files that already exist on disk when the corresponding regenerate flag is false. Up to 12 facets supported.",
      arguments: z.object({
        outputDir: z.string(),
        portraitPrompt: z.string().optional(),
        portraitFilename: z.string().default("portrait.png"),
        facets: z.array(z.object({
          name: z.string(),
          imagePrompt: z.string().optional(),
          imageFilename: z.string(),
          cardFilename: z.string().optional(),
          cardDesc: z.string().optional(),
        })).max(12).optional(),
        imageApiKey: z.string().meta({ sensitive: true }),
        imageModel: z.string().default("gpt-image-2"),
        imageStyle: z.string().default("pencil-bw"),
        imageBackground: z.string().default("white"),
        imageSize: z.string().default("1024x1024"),
        imageQuality: z.string().default("high"),
        cardStyle: z.string().default("iam-portrait"),
        regeneratePortrait: z.boolean().default(true),
        regenerateFacetImages: z.boolean().default(true),
        regenerateFacetCards: z.boolean().default(true),
      }),
      execute: async (
        args: {
          outputDir: string;
          portraitPrompt?: string;
          portraitFilename: string;
          facets?: Array<{
            name: string;
            imagePrompt?: string;
            imageFilename: string;
            cardFilename?: string;
            cardDesc?: string;
          }>;
          imageApiKey: string;
          imageModel: string;
          imageStyle: string;
          imageBackground: string;
          imageSize: string;
          imageQuality: string;
          cardStyle: string;
          regeneratePortrait: boolean;
          regenerateFacetImages: boolean;
          regenerateFacetCards: boolean;
        },
        context: ModelContext,
      ) => {
        await Deno.mkdir(args.outputDir, { recursive: true });
        const style = (args.imageStyle as ImageStyle) ?? "pencil-bw";
        const cardStyle = (args.cardStyle as CardStyle) ?? "iam-portrait";
        let generated = 0;
        let skipped = 0;

        async function writeIfNeeded(
          filename: string,
          shouldRegen: boolean,
          generate: () => Promise<Uint8Array>,
        ): Promise<void> {
          const filePath = `${args.outputDir}/${filename}`;
          if (!shouldRegen && await pathExists(filePath)) {
            skipped++;
            return;
          }
          const bytes = await generate();
          await Deno.writeFile(filePath, bytes);
          generated++;
        }

        // Portrait
        if (args.portraitPrompt) {
          await writeIfNeeded(
            args.portraitFilename,
            args.regeneratePortrait,
            () =>
              generateImageBytes(
                args.imageApiKey,
                args.imageModel,
                args.portraitPrompt!,
                style,
                args.imageBackground,
                args.imageSize,
                args.imageQuality,
              ),
          );
          context.logger.info("Portrait {status}: {file}", {
            status: args.regeneratePortrait ? "generated" : "preserved",
            file: args.portraitFilename,
          });
        }

        // Facet images and cards
        for (const facet of args.facets ?? []) {
          if (facet.imagePrompt) {
            await writeIfNeeded(
              facet.imageFilename,
              args.regenerateFacetImages,
              () =>
                generateImageBytes(
                  args.imageApiKey,
                  args.imageModel,
                  facet.imagePrompt!,
                  style,
                  args.imageBackground,
                  args.imageSize,
                  args.imageQuality,
                ),
            );
          }
          if (facet.cardFilename) {
            await writeIfNeeded(
              facet.cardFilename,
              args.regenerateFacetCards,
              () =>
                generateCardBytes(
                  args.imageApiKey,
                  args.imageModel,
                  facet.imagePrompt ?? facet.name,
                  facet.name,
                  cardStyle,
                  args.imageSize,
                  args.imageQuality,
                ),
            );
          }
        }

        context.logger.info(
          "generateAllMedia complete: {generated} generated, {skipped} skipped",
          { generated, skipped },
        );
        return { dataHandles: [] };
      },
    },

    buildTrackManifest: {
      description:
        "Scan the subject's output directory and all versioned subdirectories for audio files, merge with the iam-tracks.json sidecar for titles and lyrics, and store an ordered track manifest for the page step to consume.",
      arguments: z.object({
        outputDir: z.string(),
        newTracks: z.array(MusicTrackSchema).optional().describe(
          "Tracks from the music generation step this run. Used to update the sidecar with new title/lyrics metadata.",
        ),
      }),
      execute: async (
        args: { outputDir: string; newTracks?: MusicTrack[] },
        context: ModelContext,
      ) => {
        const sidecar = await readTrackSidecar(args.outputDir);

        // Merge new track metadata into sidecar
        if (args.newTracks && args.newTracks.length > 0) {
          for (const track of args.newTracks) {
            const key = track.filename;
            sidecar[key] = { title: track.title, lyrics: track.lyrics };
          }
          await writeTrackSidecar(args.outputDir, sidecar);
        }

        // Collect all audio files: current dir + versioned subdirs
        const currentFiles = await scanAudioFiles(args.outputDir);
        const versionDirs = await listVersionDirs(args.outputDir);
        const versionedFiles: string[] = [];
        for (const v of versionDirs) {
          const vFiles = await scanAudioFiles(`${args.outputDir}/${v}`);
          for (const f of vFiles) versionedFiles.push(`${v}/${f}`);
        }

        // Build ordered track list: current first, then versioned (newest version last = oldest first)
        const allFiles = [...currentFiles, ...versionedFiles];
        const tracks: MusicTrack[] = allFiles.map((filename) => {
          const basename = filename.split("/").pop() ?? filename;
          const meta = sidecar[basename] ?? sidecar[filename];
          return {
            filename,
            title: meta?.title ?? basename.replace(/\.[^.]+$/, ""),
            lyrics: meta?.lyrics,
          };
        });

        context.logger.info("Track manifest built: {count} tracks", {
          count: tracks.length,
        });
        const handle = await context.writeResource("tracks", "tracks", {
          tracks,
          scannedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },

    register: {
      description:
        "Upsert the subject's entry in the _data/iams.yml Jekyll registry. Reads the generated page title and date from the page data resource and writes the entry.",
      arguments: z.object({
        registryPath: z.string().default("_data/iams.yml"),
        slug: z.string(),
        subject: z.string(),
        title: z.string(),
        date: z.string().describe(
          "ISO 8601 date string (e.g. from generatedAt)",
        ),
        description: z.string().optional(),
      }),
      execute: async (
        args: {
          registryPath: string;
          slug: string;
          subject: string;
          title: string;
          date: string;
          description?: string;
        },
        context: ModelContext,
      ) => {
        await upsertIamRegistry(args.registryPath, {
          slug: args.slug,
          subject: args.subject,
          title: args.title,
          date: args.date,
          description: args.description,
        });
        context.logger.info("Registered {slug} in {path}", {
          slug: args.slug,
          path: args.registryPath,
        });
        return { dataHandles: [] };
      },
    },
  },
};

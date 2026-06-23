import { z } from "npm:zod@4";
import {
  type ApiFormat,
  ApiFormatSchema,
  type Branding,
  BrandingSchema,
  buildRequest,
  extractContent,
  resolveBaseUrl,
  type SkillLevel,
  SkillLevelSchema,
} from "./content_shared.ts";

const VerbositySchema = z.enum(["minimal", "standard", "detailed"]);
const CompletenessSchema = z.enum(["essential", "comprehensive", "exhaustive"]);
const OutputFormatSchema = z.enum(["html", "markdown"]);

type Verbosity = z.infer<typeof VerbositySchema>;
type Completeness = z.infer<typeof CompletenessSchema>;
type OutputFormat = z.infer<typeof OutputFormatSchema>;

const CheatsheetSchema = z.object({
  title: z.string(),
  topic: z.string(),
  details: z.string().optional(),
  skillLevel: SkillLevelSchema,
  verbosity: VerbositySchema,
  completeness: CompletenessSchema,
  outputFormat: OutputFormatSchema,
  wordCount: z.number().int().nonnegative(),
  model: z.string(),
  generatedAt: z.string(),
});

type ModelContext = {
  globalArgs: {
    apiFormat: ApiFormat;
    apiKey?: string;
    baseUrl?: string;
    outputDir?: string;
    branding?: Branding;
  };
  writeResource: (
    specName: "cheatsheet",
    name: string,
    content: unknown,
  ) => Promise<unknown>;
  createFileWriter: (
    specName: "html" | "markdown",
    name: string,
  ) => {
    writeText: (text: string) => Promise<unknown>;
  };
  logger: {
    info: (msg: string, props?: Record<string, unknown>) => void;
    error: (msg: string, props?: Record<string, unknown>) => void;
  };
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter((w) => w.length > 0).length;
}

const VERBOSITY_SCORE: Record<Verbosity, number> = {
  minimal: 1,
  standard: 2,
  detailed: 3,
};

const COMPLETENESS_SCORE: Record<Completeness, number> = {
  essential: 1,
  comprehensive: 2,
  exhaustive: 3,
};

const TOKEN_BUDGET: Record<number, number> = {
  2: 1500,
  3: 2500,
  4: 4000,
  5: 6000,
  6: 9000,
};

function calcMaxTokens(
  verbosity: Verbosity,
  completeness: Completeness,
): number {
  const sum = VERBOSITY_SCORE[verbosity] + COMPLETENESS_SCORE[completeness];
  return TOKEN_BUDGET[sum] ?? 4000;
}

const SKILL_LEVEL_DIRECTIVES: Record<string, string> = {
  novice:
    "Skill level: NOVICE. The reader is new to this topic. Every command and concept must be briefly explained. Prefer simple examples. Avoid jargon unless defining it inline.",
  intermediate:
    "Skill level: INTERMEDIATE. The reader understands the basics. Use standard terminology without defining fundamentals. Include common patterns and typical usage.",
  senior:
    "Skill level: SENIOR. The reader is an experienced engineer. Skip basics entirely. Include flags, edge cases, performance notes, and non-obvious behaviours.",
  guru:
    "Skill level: GURU. The reader is a domain expert. Treat them as a peer. Include internals, contested choices, obscure flags, gotchas, and advanced composition patterns.",
};

const HTML_COMPONENT_VOCABULARY = `## Cheatsheet HTML component vocabulary

The page shell provides all CSS. Your output is the content placed between the
opening <main> and closing </main> tags. Use ONLY these components:

### Quick reference bar (place first, always include)
A dark bar listing the 5-8 most essential one-liners or facts for instant recall.
  <div class="cs-quickref">
    <span class="cs-qr-label">Quick ref</span>
    <div class="cs-qr-items">
      <div class="cs-qr-item"><code>cmd --flag</code> <span>what it does</span></div>
      <div class="cs-qr-item"><code>another cmd</code> <span>brief description</span></div>
    </div>
  </div>

### Sections (group related content; vary colours across sections)
Available data-color values: blue, green, red, purple, orange, teal
  <section class="cs-section" data-color="blue">
    <h2 class="cs-section-title">Section Name</h2>
    <!-- section content goes here -->
  </section>

### Items grid (two-column command/description pairs; use inside sections)
  <div class="cs-items">
    <div class="cs-item">
      <div class="cs-item-cmd"><code>command --flag value</code></div>
      <div class="cs-item-desc">What this command does, concisely</div>
    </div>
    <div class="cs-item">
      <div class="cs-item-cmd"><code>another example</code></div>
      <div class="cs-item-desc">Brief explanation</div>
    </div>
  </div>

### Two-column grid (side-by-side content blocks, not for items)
  <div class="cs-grid">
    <div>
      <h3>Left column heading</h3>
      <p>Content here</p>
    </div>
    <div>
      <h3>Right column heading</h3>
      <p>Content here</p>
    </div>
  </div>

### Callouts (for tips, warnings, notes — use sparingly)
  <div class="cs-callout tip"><span class="cs-callout-label">Tip</span> Text of the tip.</div>
  <div class="cs-callout warning"><span class="cs-callout-label">Warning</span> Text of the warning.</div>
  <div class="cs-callout note"><span class="cs-callout-label">Note</span> Text of the note.</div>

### Tables (for structured comparisons or option lists)
  <table class="cs-table">
    <thead><tr><th>Column A</th><th>Column B</th><th>Column C</th></tr></thead>
    <tbody>
      <tr><td><code>value</code></td><td>Description</td><td>Notes</td></tr>
    </tbody>
  </table>

### Inline code and blocks
Use <code> inline. For multi-line examples:
  <pre class="cs-code"><code>multi
line
example</code></pre>

## Layout rules

- Open with the quick-ref bar, then lay out 4-8 sections.
- Vary colours: blue → green → red → purple → orange → teal (don't repeat adjacent).
- Mix layout types: items grid in some sections, tables in others, cs-grid for two-column prose.
- Include at least one cs-callout (tip or warning) somewhere in the content.
- Do NOT invent new CSS classes or add inline styles.
- Do NOT include <html>, <head>, <body>, <style>, or <script> tags.
- Output raw HTML only — no markdown, no code fences.`;

const MARKDOWN_RULES = `## Markdown output rules

- Use standard GitHub-flavoured markdown.
- Use # for the cheatsheet title, ## for sections, ### for subsections.
- Use code fences (\`\`\`) for multi-line examples and \`inline code\` for commands.
- Use tables for command/description pairs where appropriate.
- Use > blockquotes for tips and warnings (prefix with **Tip:** or **Warning:**).
- Use bullet lists for option enumerations.
- Include a "Quick Reference" section first with the 5-8 most critical facts.
- Output markdown only — no HTML tags, no preamble, no trailing commentary.`;

function buildHtmlSystemPrompt(
  skillLevel: SkillLevel,
  verbosity: Verbosity,
  completeness: Completeness,
): string {
  const verbosityDirective: Record<Verbosity, string> = {
    minimal:
      "Verbosity: MINIMAL. Keep descriptions extremely concise — one short phrase per item. No prose paragraphs; items and callouts only.",
    standard:
      "Verbosity: STANDARD. Descriptions are one concise sentence. Prose in callouts and cs-grid blocks is 1-2 sentences.",
    detailed:
      "Verbosity: DETAILED. Descriptions may be 1-2 sentences. Callouts and prose blocks can be a short paragraph with examples.",
  };
  const completenessDirective: Record<Completeness, string> = {
    essential:
      "Completeness: ESSENTIAL. Cover only the most important 20% of the topic — the commands and concepts used 80% of the time. Ruthlessly omit edge cases.",
    comprehensive:
      "Completeness: COMPREHENSIVE. Cover the mainstream of the topic thoroughly: common commands, important flags, typical patterns, and a few non-obvious gotchas.",
    exhaustive:
      "Completeness: EXHAUSTIVE. Cover the topic in depth: all significant commands and flags, edge cases, advanced patterns, and practical gotchas. Use as many sections as needed.",
  };

  return `You are an expert technical writer. You create dense, visually structured cheatsheets as HTML content.

${SKILL_LEVEL_DIRECTIVES[skillLevel]}
${verbosityDirective[verbosity]}
${completenessDirective[completeness]}

${HTML_COMPONENT_VOCABULARY}

## Critical constraints
- Your entire response is the HTML body only — no markdown, no code fences, no commentary.
- Start directly with <div class="cs-quickref"> and end with the closing </section> of your last section.
- Use ONLY the component classes defined above. No invented classes, no inline styles.
- Every <code> block must contain realistic, accurate content for the topic.
- The cheatsheet must be factually correct. When in doubt about a command or flag, omit it.`;
}

function buildMarkdownSystemPrompt(
  skillLevel: SkillLevel,
  verbosity: Verbosity,
  completeness: Completeness,
): string {
  const verbosityDirective: Record<Verbosity, string> = {
    minimal:
      "Verbosity: MINIMAL. One short phrase per item. No prose paragraphs.",
    standard: "Verbosity: STANDARD. One concise sentence per description.",
    detailed:
      "Verbosity: DETAILED. Descriptions may be 2-3 sentences with examples.",
  };
  const completenessDirective: Record<Completeness, string> = {
    essential:
      "Completeness: ESSENTIAL. Cover only the most-used 20% of the topic.",
    comprehensive:
      "Completeness: COMPREHENSIVE. Cover mainstream usage thoroughly, including common gotchas.",
    exhaustive:
      "Completeness: EXHAUSTIVE. Full coverage: all significant commands, flags, edge cases, and advanced patterns.",
  };

  return `You are an expert technical writer. You create dense, well-structured cheatsheets in Markdown.

${SKILL_LEVEL_DIRECTIVES[skillLevel]}
${verbosityDirective[verbosity]}
${completenessDirective[completeness]}

${MARKDOWN_RULES}

## Critical constraints
- Your entire response is markdown only — no HTML, no commentary, no preamble.
- Start directly with # Title.
- The cheatsheet must be factually correct. When in doubt about a command or flag, omit it.`;
}

const PAGE_CSS = `
  :root {
    --cs-hue-blue: #1a73e8;
    --cs-hue-green: #1e8e3e;
    --cs-hue-red: #d93025;
    --cs-hue-purple: #7b1fa2;
    --cs-hue-orange: #e37400;
    --cs-hue-teal: #007b83;
    --cs-bg: #fafafa;
    --cs-surface: #ffffff;
    --cs-text: #1f1f1f;
    --cs-text-muted: #5f6368;
    --cs-border: #e0e0e0;
    --cs-code-bg: #f1f3f4;
    --cs-header-bg: #1f1f1f;
    --cs-header-text: #ffffff;
    --cs-quickref-bg: #2d2d2d;
    --cs-quickref-text: #f8f9fa;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    line-height: 1.5;
    background: var(--cs-bg);
    color: var(--cs-text);
  }
  .cs-page-header {
    background: var(--cs-header-bg);
    color: var(--cs-header-text);
    padding: 18px 24px 14px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .cs-page-header h1 {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 28px;
    font-weight: 700;
    letter-spacing: -0.5px;
    line-height: 1.2;
  }
  .cs-page-meta {
    font-size: 11px;
    color: #9aa0a6;
    display: flex;
    gap: 16px;
  }
  main {
    max-width: 1100px;
    margin: 0 auto;
    padding: 16px 20px 40px;
  }
  /* Quick reference bar */
  .cs-quickref {
    background: var(--cs-quickref-bg);
    color: var(--cs-quickref-text);
    border-radius: 6px;
    padding: 12px 16px;
    margin-bottom: 16px;
    display: flex;
    gap: 16px;
    align-items: flex-start;
  }
  .cs-qr-label {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #9aa0a6;
    white-space: nowrap;
    padding-top: 2px;
    min-width: 56px;
  }
  .cs-qr-items {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 20px;
  }
  .cs-qr-item {
    display: flex;
    gap: 8px;
    align-items: baseline;
    font-size: 12px;
  }
  .cs-qr-item code {
    font-family: 'Courier New', Courier, monospace;
    font-size: 11.5px;
    color: #8ab4f8;
    background: rgba(255,255,255,0.08);
    padding: 1px 5px;
    border-radius: 3px;
  }
  .cs-qr-item span { color: #bdc1c6; }
  /* Sections */
  .cs-section {
    background: var(--cs-surface);
    border-radius: 6px;
    border-left: 4px solid var(--cs-border);
    margin-bottom: 12px;
    padding: 12px 16px 14px;
    break-inside: avoid;
  }
  .cs-section[data-color="blue"]   { border-left-color: var(--cs-hue-blue);   }
  .cs-section[data-color="green"]  { border-left-color: var(--cs-hue-green);  }
  .cs-section[data-color="red"]    { border-left-color: var(--cs-hue-red);    }
  .cs-section[data-color="purple"] { border-left-color: var(--cs-hue-purple); }
  .cs-section[data-color="orange"] { border-left-color: var(--cs-hue-orange); }
  .cs-section[data-color="teal"]   { border-left-color: var(--cs-hue-teal);   }
  .cs-section-title {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 15px;
    font-weight: 700;
    margin-bottom: 10px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--cs-border);
  }
  .cs-section[data-color="blue"]   .cs-section-title { color: var(--cs-hue-blue);   }
  .cs-section[data-color="green"]  .cs-section-title { color: var(--cs-hue-green);  }
  .cs-section[data-color="red"]    .cs-section-title { color: var(--cs-hue-red);    }
  .cs-section[data-color="purple"] .cs-section-title { color: var(--cs-hue-purple); }
  .cs-section[data-color="orange"] .cs-section-title { color: var(--cs-hue-orange); }
  .cs-section[data-color="teal"]   .cs-section-title { color: var(--cs-hue-teal);   }
  .cs-section h3 {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--cs-text-muted);
    margin: 10px 0 6px;
  }
  .cs-section p { font-size: 12.5px; color: var(--cs-text-muted); margin: 6px 0; }
  /* Items grid */
  .cs-items {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px 16px;
  }
  .cs-item {
    display: flex;
    gap: 8px;
    align-items: baseline;
    padding: 3px 0;
    border-bottom: 1px solid #f0f0f0;
    font-size: 12px;
  }
  .cs-item:last-child { border-bottom: none; }
  .cs-item-cmd {
    flex: 0 0 auto;
    min-width: 120px;
    max-width: 200px;
  }
  .cs-item-cmd code {
    font-family: 'Courier New', Courier, monospace;
    font-size: 11.5px;
    background: var(--cs-code-bg);
    padding: 1px 5px;
    border-radius: 3px;
    white-space: nowrap;
    word-break: break-all;
  }
  .cs-item-desc { color: var(--cs-text-muted); flex: 1; }
  /* Two-column grid */
  .cs-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px 20px;
    margin-top: 6px;
  }
  .cs-grid h3 {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 12px;
    font-weight: 700;
    color: var(--cs-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
  }
  .cs-grid p, .cs-grid li { font-size: 12px; color: var(--cs-text-muted); margin: 4px 0; }
  .cs-grid ul, .cs-grid ol { padding-left: 16px; }
  /* Callouts */
  .cs-callout {
    display: flex;
    gap: 8px;
    align-items: baseline;
    padding: 7px 10px;
    border-radius: 4px;
    font-size: 12px;
    margin: 8px 0;
  }
  .cs-callout.tip     { background: #e8f5e9; color: #1e6823; }
  .cs-callout.warning { background: #fff3e0; color: #7c4a03; }
  .cs-callout.note    { background: #e8f0fe; color: #1a5276; }
  .cs-callout-label {
    font-family: Georgia, 'Times New Roman', serif;
    font-weight: 700;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    white-space: nowrap;
  }
  /* Tables */
  .cs-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    margin-top: 6px;
  }
  .cs-table th {
    font-family: Georgia, 'Times New Roman', serif;
    background: #f1f3f4;
    text-align: left;
    padding: 5px 8px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    border-bottom: 2px solid var(--cs-border);
  }
  .cs-table td {
    padding: 4px 8px;
    border-bottom: 1px solid #f0f0f0;
    vertical-align: top;
    color: var(--cs-text-muted);
  }
  .cs-table tr:last-child td { border-bottom: none; }
  .cs-table code {
    font-family: 'Courier New', Courier, monospace;
    font-size: 11px;
    background: var(--cs-code-bg);
    padding: 1px 4px;
    border-radius: 2px;
  }
  /* Code block */
  .cs-code {
    background: var(--cs-code-bg);
    border: 1px solid var(--cs-border);
    border-radius: 4px;
    padding: 8px 12px;
    font-family: 'Courier New', Courier, monospace;
    font-size: 11.5px;
    overflow-x: auto;
    white-space: pre;
    margin: 8px 0;
  }
  /* Inline code in paragraphs */
  p code, li code {
    font-family: 'Courier New', Courier, monospace;
    font-size: 11.5px;
    background: var(--cs-code-bg);
    padding: 1px 4px;
    border-radius: 3px;
  }
  /* Print */
  @media print {
    body { background: white; font-size: 11px; }
    .cs-page-header { background: #1f1f1f !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    main { max-width: 100%; padding: 8px; }
    .cs-quickref { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .cs-section { break-inside: avoid; box-shadow: none; border: 1px solid #e0e0e0; }
    .cs-callout.tip     { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .cs-callout.warning { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .cs-callout.note    { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
  /* Branding footer */
  .cs-brand-footer { padding: 0.5rem 1.5rem; text-align: right; border-top: 1px solid var(--cs-border); }
  .cs-brand-footer img { height: 22px; width: auto; vertical-align: middle; }
  .cs-brand-footer a { text-decoration: none; opacity: 0.65; }
  .cs-brand-footer a:hover { opacity: 1; }
`;

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
  return `\n<footer class="cs-brand-footer">${content}</footer>`;
}

function renderHtmlPage(
  title: string,
  topic: string,
  body: string,
  skillLevel: SkillLevel,
  verbosity: Verbosity,
  completeness: Completeness,
  model: string,
  generatedAt: string,
  branding?: Branding,
): string {
  const safeTitle = escapeHtml(title);
  const meta = [
    `${skillLevel} · ${verbosity} · ${completeness}`,
    `model: ${model}`,
    generatedAt.split("T")[0],
  ].join("  |  ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeTitle}</title>
<style>${PAGE_CSS}</style>
</head>
<body>
<header class="cs-page-header">
  <h1>${safeTitle}</h1>
  <div class="cs-page-meta"><span>${
    escapeHtml(topic)
  }</span><span>${meta}</span></div>
</header>
<main>
${body}
</main>${renderBrandFooter(branding)}
</body>
</html>`;
}

async function storeCheatsheet(
  context: ModelContext,
  metadata: z.infer<typeof CheatsheetSchema>,
  outputFormat: OutputFormat,
  content: string,
  outputDirOverride?: string,
  filenameOverride?: string,
): Promise<{ dataHandles: unknown[] }> {
  const handles: unknown[] = [];

  const resourceHandle = await context.writeResource(
    "cheatsheet",
    "main",
    metadata,
  );
  handles.push(resourceHandle);

  if (outputFormat === "html") {
    const htmlTitle = metadata.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const outputDir = outputDirOverride ?? context.globalArgs.outputDir;
    if (outputDir) {
      await Deno.mkdir(outputDir, { recursive: true });
      const filename = filenameOverride ?? `${htmlTitle}-cheatsheet.html`;
      const filePath = `${outputDir}/${filename}`;
      await Deno.writeTextFile(filePath, content);
      context.logger.info("Wrote HTML cheatsheet", { path: filePath });
    }
    const fileWriter = context.createFileWriter("html", "html");
    const fileHandle = await fileWriter.writeText(content);
    handles.push(fileHandle);
  } else {
    const mdTitle = metadata.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const outputDir = outputDirOverride ?? context.globalArgs.outputDir;
    if (outputDir) {
      await Deno.mkdir(outputDir, { recursive: true });
      const filename = filenameOverride ?? `${mdTitle}-cheatsheet.md`;
      const filePath = `${outputDir}/${filename}`;
      await Deno.writeTextFile(filePath, content);
      context.logger.info("Wrote Markdown cheatsheet", { path: filePath });
    }
    const fileWriter = context.createFileWriter("markdown", "markdown");
    const fileHandle = await fileWriter.writeText(content);
    handles.push(fileHandle);
  }

  return { dataHandles: handles };
}

function deriveTitle(
  topic: string,
  content: string,
  outputFormat: OutputFormat,
): string {
  if (outputFormat === "html") {
    const m = content.match(/<h[12][^>]*>([^<]+)<\/h[12]>/i);
    if (m) return m[1].trim();
  } else {
    const m = content.match(/^#\s+(.+)/m);
    if (m) return m[1].trim();
  }
  return `${topic} Cheatsheet`;
}

/**
 * Cheatsheet generator that calls any compatible LLM inference endpoint.
 *
 * Supports Anthropic's Messages API and any OpenAI-compatible endpoint
 * (Ollama, vLLM, Groq, Together, OpenRouter, etc.). Accepts a topic, optional
 * details, skill level, verbosity, and completeness. Returns a structured
 * `cheatsheet` resource (title, topic, skill level, word count, metadata) and
 * either a print-to-PDF-ready `html` file or a `markdown` file.
 *
 * Two entry points: `generate` calls the configured inference endpoint
 * (requires endpoint config), while `save` stores a cheatsheet written by the
 * caller — e.g. a coding agent — with no inference call and no API key.
 */
export const model = {
  type: "@alvagante/content-cheatsheet",
  version: "2026.06.23.2",

  globalArguments: z.object({
    apiFormat: ApiFormatSchema.default("anthropic"),
    apiKey: z.string().optional().meta({ sensitive: true }),
    baseUrl: z.string().url().optional(),
    outputDir: z.string().optional(),
    branding: BrandingSchema.optional(),
  }),

  resources: {
    cheatsheet: {
      description:
        "Cheatsheet metadata: topic, skill level, verbosity, completeness, word count, model, and generation timestamp",
      schema: CheatsheetSchema,
      lifetime: "infinite" as const,
      garbageCollection: 20,
    },
  },

  files: {
    html: {
      description:
        "Self-contained print-to-PDF-ready HTML cheatsheet (Cmd-P → Save as PDF)",
      contentType: "text/html",
      lifetime: "infinite" as const,
      garbageCollection: 20,
    },
    markdown: {
      description: "GitHub-flavoured Markdown cheatsheet",
      contentType: "text/markdown",
      lifetime: "infinite" as const,
      garbageCollection: 20,
    },
  },

  methods: {
    generate: {
      description:
        "Call the configured LLM to generate a cheatsheet on the given topic. Outputs a print-ready HTML file (outputFormat=html, default) or a Markdown file (outputFormat=markdown).",
      arguments: z.object({
        topic: z.string().describe(
          "The subject of the cheatsheet (e.g. 'git', 'awk', 'Kubernetes RBAC')",
        ),
        details: z.string().optional().describe(
          "Additional context, constraints, or focus areas for the cheatsheet",
        ),
        skillLevel: SkillLevelSchema.default("intermediate").describe(
          "Target reader expertise level",
        ),
        verbosity: VerbositySchema.default("standard").describe(
          "Description density per item",
        ),
        completeness: CompletenessSchema.default("comprehensive").describe(
          "Topic coverage breadth",
        ),
        outputFormat: OutputFormatSchema.default("html").describe(
          "html produces a print-to-PDF-ready page; markdown produces a .md file",
        ),
        model: z.string().default("claude-opus-4-8").describe(
          "LLM model ID to use for generation",
        ),
        outputDir: z.string().optional().describe(
          "Override the global outputDir for this run",
        ),
        filename: z.string().optional().describe(
          "Override the output filename (e.g. 'cheatsheet.html'). Defaults to '{title-slug}-cheatsheet.html'. Only applies to html and markdown outputFormats.",
        ),
      }),
      execute: async (args: {
        topic: string;
        details?: string;
        skillLevel: SkillLevel;
        verbosity: Verbosity;
        completeness: Completeness;
        outputFormat: OutputFormat;
        model: string;
        outputDir?: string;
        filename?: string;
      }, context: ModelContext): Promise<{ dataHandles: unknown[] }> => {
        const {
          topic,
          details,
          skillLevel,
          verbosity,
          completeness,
          outputFormat,
          model: modelId,
          outputDir,
          filename,
        } = args;

        const { apiFormat, apiKey, baseUrl } = context.globalArgs;
        const resolvedUrl = resolveBaseUrl(apiFormat, baseUrl);
        const maxTokens = calcMaxTokens(verbosity, completeness);

        const systemPrompt = outputFormat === "html"
          ? buildHtmlSystemPrompt(skillLevel, verbosity, completeness)
          : buildMarkdownSystemPrompt(skillLevel, verbosity, completeness);

        const userMessage = details
          ? `Topic: ${topic}\n\nAdditional context: ${details}`
          : `Topic: ${topic}`;

        context.logger.info("Generating cheatsheet", {
          topic,
          skillLevel,
          verbosity,
          completeness,
          outputFormat,
          model: modelId,
          maxTokens,
        });

        const { url, headers, body } = buildRequest(
          apiFormat,
          apiKey,
          resolvedUrl,
          modelId,
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
          const errorText = await response.text();
          context.logger.error("LLM API request failed", {
            status: response.status,
            body: errorText.slice(0, 500),
          });
          throw new Error(
            `LLM API error ${response.status}: ${errorText.slice(0, 200)}`,
          );
        }

        const responseJson = await response.json();
        const { text: rawContent, stopReason } = extractContent(
          apiFormat,
          responseJson,
        );

        context.logger.info("LLM response received", {
          stopReason,
          chars: rawContent.length,
        });

        if (!rawContent) {
          throw new Error("LLM returned empty content");
        }

        const title = deriveTitle(topic, rawContent, outputFormat);
        const generatedAt = new Date().toISOString();

        let outputContent: string;
        if (outputFormat === "html") {
          outputContent = renderHtmlPage(
            title,
            topic,
            rawContent,
            skillLevel,
            verbosity,
            completeness,
            modelId,
            generatedAt,
            context.globalArgs.branding,
          );
        } else {
          outputContent = rawContent;
        }

        const wordCount = countWords(rawContent);
        const metadata: z.infer<typeof CheatsheetSchema> = {
          title,
          topic,
          details: details || undefined,
          skillLevel,
          verbosity,
          completeness,
          outputFormat,
          wordCount,
          model: modelId,
          generatedAt,
        };

        return await storeCheatsheet(
          context,
          metadata,
          outputFormat,
          outputContent,
          outputDir,
          filename,
        );
      },
    },

    save: {
      description:
        "Store agent-written cheatsheet content without making an LLM call. Wraps HTML bodies in the page shell; stores Markdown as-is.",
      arguments: z.object({
        topic: z.string().describe("The subject of the cheatsheet"),
        content: z.string().describe(
          "Cheatsheet body — HTML component markup for html format, or Markdown for markdown format",
        ),
        title: z.string().optional().describe(
          "Override the title; otherwise derived from the first heading in content",
        ),
        details: z.string().optional().describe(
          "Context recorded in the cheatsheet resource",
        ),
        skillLevel: SkillLevelSchema.default("intermediate"),
        verbosity: VerbositySchema.default("standard"),
        completeness: CompletenessSchema.default("comprehensive"),
        outputFormat: OutputFormatSchema.default("html"),
        model: z.string().default("external").describe(
          "Identifier of whatever produced the content",
        ),
        outputDir: z.string().optional(),
      }),
      execute: async (args: {
        topic: string;
        content: string;
        title?: string;
        details?: string;
        skillLevel: SkillLevel;
        verbosity: Verbosity;
        completeness: Completeness;
        outputFormat: OutputFormat;
        model: string;
        outputDir?: string;
      }, context: ModelContext): Promise<{ dataHandles: unknown[] }> => {
        const {
          topic,
          content,
          title: titleOverride,
          details,
          skillLevel,
          verbosity,
          completeness,
          outputFormat,
          model: modelId,
          outputDir,
        } = args;

        const title = titleOverride ??
          deriveTitle(topic, content, outputFormat);
        const generatedAt = new Date().toISOString();

        let outputContent: string;
        if (outputFormat === "html") {
          outputContent = renderHtmlPage(
            title,
            topic,
            content,
            skillLevel,
            verbosity,
            completeness,
            modelId,
            generatedAt,
          );
        } else {
          outputContent = content;
        }

        const wordCount = countWords(content);
        const metadata: z.infer<typeof CheatsheetSchema> = {
          title,
          topic,
          details: details || undefined,
          skillLevel,
          verbosity,
          completeness,
          outputFormat,
          wordCount,
          model: modelId,
          generatedAt,
        };

        return await storeCheatsheet(
          context,
          metadata,
          outputFormat,
          outputContent,
          outputDir,
        );
      },
    },
  },
};

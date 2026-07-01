/**
 * Content timeline generator — self-contained HTML timeline pages for any subject.
 *
 * Supports biographical, historical, project, technology, and custom timelines.
 * Organises events into named life/project phases. All events must be factually
 * documented; the LLM is explicitly prohibited from inventing dates or events.
 * Uses Claude or any OpenAI-compatible endpoint, or stores caller-written content
 * via the `save` method with no inference call.
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
  extractContent,
  resolveBaseUrl,
} from "./content_shared.ts";

const TimelineTypeSchema = z.enum([
  "biographical",
  "historical",
  "project",
  "technology",
  "custom",
]);
type TimelineType = z.infer<typeof TimelineTypeSchema>;

const DensitySchema = z.enum(["sparse", "standard", "dense"]);
type Density = z.infer<typeof DensitySchema>;

const TimelineSchema = z.object({
  subject: z.string(),
  timelineType: TimelineTypeSchema,
  details: z.string().optional(),
  density: DensitySchema,
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
    specName: "timeline",
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

const TOKEN_BUDGET: Record<Density, number> = {
  sparse: 2000,
  standard: 3500,
  dense: 6000,
};

const DENSITY_DIRECTIVE: Record<Density, string> = {
  sparse:
    "SPARSE density: 6–10 events total across all phases. Only the most significant, well-documented milestones. Prefer events that define the subject's legacy or turning points.",
  standard:
    "STANDARD density: 12–20 events total. Cover all major documented events, turning points, and representative details. Balance breadth with precision.",
  dense:
    "DENSE density: 25–40 events total. Include major events, secondary milestones, key dates, and contextual detail. Every entry must be a real, documented fact — no padding.",
};

const TYPE_DIRECTIVE: Record<TimelineType, string> = {
  biographical:
    "Biographical timeline of a person's life. Cover: birth and family, education, career milestones, key relationships, publications or achievements, health events, death. All dates must be historically documented.",
  historical:
    "Historical event or period timeline. Cover: political events, conflicts, treaties, social changes, economic turning points, significant figures. All dates from documented historical sources.",
  project:
    "Project or product timeline. Cover: inception, planning phases, key releases, pivots, team changes, public launches, deprecation or end-of-life. Dates from documented project records.",
  technology:
    "Technology evolution timeline. Cover: invention or first publication, early adoption, key versions or standards, industry turning points, obsolescence or reinvention. All dates from documented sources.",
  custom:
    "Custom timeline. Use the details provided to determine the most relevant events and phases. Maintain strict factual accuracy throughout.",
};

const HTML_COMPONENT_VOCABULARY = `## Timeline HTML component vocabulary

The page shell provides all CSS. Your output is the content placed between
<main class="tl-main"> and </main>. Use ONLY these components:

### Phase block (repeat for each phase; vary data-color across phases)
Available data-color values: amber, sage, rust, slate, dusk, umber

  <div class="tl-phase" data-color="amber">
    <div class="tl-phase-header">
      <span class="tl-phase-name">Phase Name</span>
      <span class="tl-phase-span">1883 – 1900</span>
    </div>
    <div class="tl-events">
      <!-- event entries here -->
    </div>
  </div>

### Event entry (inside tl-events; ordered chronologically)
Date format: use the most precise available — full "1883 Jul 3", month-year "1883 Jul",
year only "1883", or approximate "c. 1920". Never invent or estimate a date as certain.

  <div class="tl-event">
    <div class="tl-date">1883 Jul 3</div>
    <div class="tl-connector"><div class="tl-dot"></div></div>
    <div class="tl-body">
      <div class="tl-title">Concise event title (≤10 words)</div>
      <div class="tl-desc">One or two factual sentences. No invented content.</div>
    </div>
  </div>

## Layout rules

- Open with the first tl-phase block; close with the last.
- Use 3–7 phases with a name and a year span each.
- Vary data-color in order: amber → sage → rust → slate → dusk → umber; cycle if needed.
- Order events chronologically within each phase.
- Do NOT invent CSS classes or add inline styles.
- Do NOT include <html>, <head>, <body>, <style>, or <script> tags.
- Output raw HTML only — no markdown, no code fences, no preamble, no commentary.
- Start directly with <div class="tl-phase"...>.`;

function buildSystemPrompt(
  timelineType: TimelineType,
  density: Density,
): string {
  return `You are a meticulous historian and chronologist. You create factually accurate, visually structured timelines as HTML.

${TYPE_DIRECTIVE[timelineType]}
${DENSITY_DIRECTIVE[density]}

${HTML_COMPONENT_VOCABULARY}

## Critical factual constraints
- Every event must be a real, documented occurrence with a verifiable date.
- Do NOT invent events, present approximations as certain, or fill gaps with plausible fiction.
- If a date is approximate, mark it "c. YYYY" — never present it as exact.
- For biographical timelines: birth, death, and publication dates are non-negotiable facts.
- When in doubt about a specific date, omit the event rather than guess.

## Output constraints
- Your entire response is the HTML body only — no markdown, no code fences, no commentary.
- Start directly with <div class="tl-phase" ...> and end with the closing </div> of the last phase.
- Use ONLY the component classes defined above. No invented classes, no inline styles.`;
}

const PAGE_CSS = `
:root {
  --tl-bg: #faf8f4;
  --tl-ink: #1a1a18;
  --tl-dim: #6b6360;
  --tl-rule: #d4cdc8;
  --tl-surface: #f0ede6;
  --tl-header-bg: #1a1a18;
  --tl-amber: #8b5e3c;
  --tl-sage:  #4a6741;
  --tl-rust:  #8b3522;
  --tl-slate: #3a4f68;
  --tl-dusk:  #54437a;
  --tl-umber: #5e4824;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
body {
  font-family: Georgia, "Times New Roman", "Liberation Serif", serif;
  font-size: 13px;
  line-height: 1.58;
  background: var(--tl-bg);
  color: var(--tl-ink);
}
.tl-page-header {
  background: var(--tl-header-bg);
  color: #fff;
  padding: 14px 22px 11px;
}
.tl-page-header h1 {
  font-family: Georgia, serif;
  font-size: 20px;
  font-weight: 400;
  letter-spacing: -0.2px;
  line-height: 1.2;
  margin: 0 0 3px;
}
.tl-page-meta {
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 10px;
  color: #9aa0a6;
}
.tl-main { padding: 14px 18px 28px; }

/* Phase block */
.tl-phase { margin-bottom: 20px; }
.tl-phase-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 6px 10px;
  background: var(--tl-surface);
  border-left: 3px solid var(--tl-rule);
  border-bottom: 1px solid var(--tl-rule);
}
.tl-phase[data-color="amber"] .tl-phase-header { border-left-color: var(--tl-amber); }
.tl-phase[data-color="sage"]  .tl-phase-header { border-left-color: var(--tl-sage);  }
.tl-phase[data-color="rust"]  .tl-phase-header { border-left-color: var(--tl-rust);  }
.tl-phase[data-color="slate"] .tl-phase-header { border-left-color: var(--tl-slate); }
.tl-phase[data-color="dusk"]  .tl-phase-header { border-left-color: var(--tl-dusk);  }
.tl-phase[data-color="umber"] .tl-phase-header { border-left-color: var(--tl-umber); }
.tl-phase-name {
  font-family: system-ui, sans-serif;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--tl-dim);
}
.tl-phase[data-color="amber"] .tl-phase-name { color: var(--tl-amber); }
.tl-phase[data-color="sage"]  .tl-phase-name { color: var(--tl-sage);  }
.tl-phase[data-color="rust"]  .tl-phase-name { color: var(--tl-rust);  }
.tl-phase[data-color="slate"] .tl-phase-name { color: var(--tl-slate); }
.tl-phase[data-color="dusk"]  .tl-phase-name { color: var(--tl-dusk);  }
.tl-phase[data-color="umber"] .tl-phase-name { color: var(--tl-umber); }
.tl-phase-span {
  font-family: system-ui, sans-serif;
  font-size: 10px;
  color: var(--tl-dim);
  letter-spacing: 0.03em;
}

/* Events list */
.tl-events {
  padding: 4px 0 2px 0;
  border-left: 3px solid var(--tl-rule);
  margin-left: 10px;
}
.tl-phase[data-color="amber"] .tl-events { border-left-color: var(--tl-amber); }
.tl-phase[data-color="sage"]  .tl-events { border-left-color: var(--tl-sage);  }
.tl-phase[data-color="rust"]  .tl-events { border-left-color: var(--tl-rust);  }
.tl-phase[data-color="slate"] .tl-events { border-left-color: var(--tl-slate); }
.tl-phase[data-color="dusk"]  .tl-events { border-left-color: var(--tl-dusk);  }
.tl-phase[data-color="umber"] .tl-events { border-left-color: var(--tl-umber); }

/* Single event row */
.tl-event {
  display: grid;
  grid-template-columns: 80px 22px 1fr;
  min-height: 28px;
  padding: 3px 0;
}
.tl-date {
  font-family: system-ui, sans-serif;
  font-size: 10px;
  color: var(--tl-dim);
  text-align: right;
  padding: 4px 8px 0 0;
  white-space: nowrap;
  letter-spacing: 0.02em;
}
.tl-connector {
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
}
.tl-connector::before {
  content: "";
  position: absolute;
  top: 0; bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 1px;
  background: var(--tl-rule);
}
.tl-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--tl-rule);
  margin-top: 5px;
  z-index: 1;
  position: relative;
  flex-shrink: 0;
}
.tl-phase[data-color="amber"] .tl-dot { background: var(--tl-amber); }
.tl-phase[data-color="sage"]  .tl-dot { background: var(--tl-sage);  }
.tl-phase[data-color="rust"]  .tl-dot { background: var(--tl-rust);  }
.tl-phase[data-color="slate"] .tl-dot { background: var(--tl-slate); }
.tl-phase[data-color="dusk"]  .tl-dot { background: var(--tl-dusk);  }
.tl-phase[data-color="umber"] .tl-dot { background: var(--tl-umber); }
.tl-body { padding: 2px 0 6px 6px; }
.tl-title {
  font-family: system-ui, sans-serif;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--tl-ink);
  line-height: 1.35;
}
.tl-desc {
  font-family: Georgia, serif;
  font-size: 11.5px;
  color: var(--tl-dim);
  line-height: 1.5;
  margin-top: 1px;
}

/* Branding footer */
.tl-brand-footer {
  padding: 0.5rem 1.2rem;
  text-align: right;
  border-top: 1px solid var(--tl-rule);
  margin-top: 4px;
}
.tl-brand-footer img { height: 18px; width: auto; vertical-align: middle; }
.tl-brand-footer a { text-decoration: none; opacity: 0.55; }
.tl-brand-footer a:hover { opacity: 1; }

@media print {
  body { background: white; font-size: 11px; }
  .tl-page-header { background: #1a1a18 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .tl-phase { break-inside: avoid; }
}
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
  return `\n<footer class="tl-brand-footer">${content}</footer>`;
}

function renderHtmlPage(
  subject: string,
  timelineType: TimelineType,
  density: Density,
  body: string,
  model: string,
  generatedAt: string,
  branding?: Branding,
): string {
  const safeSubject = escapeHtml(subject);
  const meta = [
    `${timelineType} · ${density}`,
    `model: ${model}`,
    generatedAt.split("T")[0],
  ].join("  ·  ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeSubject} — Timeline</title>
<style>${PAGE_CSS}</style>
</head>
<body>
<header class="tl-page-header">
  <h1>${safeSubject}</h1>
  <div class="tl-page-meta">${meta}</div>
</header>
<main class="tl-main">
${body}
</main>${renderBrandFooter(branding)}
</body>
</html>`;
}

async function storeTimeline(
  context: ModelContext,
  metadata: z.infer<typeof TimelineSchema>,
  content: string,
  outputDirOverride?: string,
  filenameOverride?: string,
): Promise<{ dataHandles: unknown[] }> {
  const handles: unknown[] = [];

  const resourceHandle = await context.writeResource(
    "timeline",
    "main",
    metadata,
  );
  handles.push(resourceHandle);

  const outputDir = outputDirOverride ?? context.globalArgs.outputDir;
  if (outputDir) {
    await Deno.mkdir(outputDir, { recursive: true });
    const filename = filenameOverride ?? "timeline.html";
    const filePath = `${outputDir}/${filename}`;
    await Deno.writeTextFile(filePath, content);
    context.logger.info("Wrote timeline HTML", { path: filePath });
  }

  const fileWriter = context.createFileWriter("html", "html");
  const fileHandle = await fileWriter.writeText(content);
  handles.push(fileHandle);

  return { dataHandles: handles };
}

/**
 * Timeline generator producing self-contained HTML timelines for any subject.
 *
 * Supports biographical, historical, project, technology, and custom timelines.
 * Events are grouped into named phases; all content must be factually documented.
 * The `generate` method calls an LLM; `save` stores caller-written content.
 */
export const model = {
  type: "@alvagante/content-timeline",
  version: "2026.06.30.1",

  globalArguments: z.object({
    apiFormat: ApiFormatSchema.default("anthropic"),
    apiKey: z.string().optional().meta({ sensitive: true }),
    baseUrl: z.string().url().optional(),
    outputDir: z.string().optional(),
    branding: BrandingSchema.optional(),
  }),

  resources: {
    timeline: {
      description:
        "Timeline metadata: subject, type, density, word count, model, and generation timestamp",
      schema: TimelineSchema,
      lifetime: "infinite" as const,
      garbageCollection: 20,
    },
  },

  files: {
    html: {
      description:
        "Self-contained scrollable HTML timeline (embeddable in iframe)",
      contentType: "text/html",
      lifetime: "infinite" as const,
      garbageCollection: 20,
    },
  },

  methods: {
    generate: {
      description:
        "Call the configured LLM to generate a factual timeline for the given subject. Outputs a self-contained HTML file with phase sections and dated events.",
      arguments: z.object({
        subject: z.string().describe(
          "The subject of the timeline — person name, project name, event, technology, era, etc.",
        ),
        timelineType: TimelineTypeSchema.default("biographical").describe(
          "Timeline focus: biographical (a person's life), historical (era or event), project (software/product), technology (tech evolution), or custom",
        ),
        details: z.string().optional().describe(
          "Additional context, phase name suggestions, focus areas, or factual notes to guide generation",
        ),
        density: DensitySchema.default("standard").describe(
          "Event density: sparse (6–10 events), standard (12–20), dense (25–40)",
        ),
        model: z.string().default("claude-opus-4-8").describe(
          "LLM model ID to use for generation",
        ),
        outputDir: z.string().optional().describe(
          "Override the global outputDir for this run",
        ),
        filename: z.string().optional().describe(
          "Override the output filename (default: timeline.html)",
        ),
      }),
      execute: async (
        args: {
          subject: string;
          timelineType: TimelineType;
          details?: string;
          density: Density;
          model: string;
          outputDir?: string;
          filename?: string;
        },
        context: ModelContext,
      ): Promise<{ dataHandles: unknown[] }> => {
        const {
          subject,
          timelineType,
          details,
          density,
          model: modelId,
          outputDir,
          filename,
        } = args;
        const { apiFormat, apiKey, baseUrl } = context.globalArgs;
        const resolvedUrl = resolveBaseUrl(apiFormat, baseUrl);
        const maxTokens = TOKEN_BUDGET[density];

        const systemPrompt = buildSystemPrompt(timelineType, density);
        const userMessage = details
          ? `Subject: ${subject}\n\nAdditional context: ${details}`
          : `Subject: ${subject}`;

        context.logger.info("Generating timeline", {
          subject,
          timelineType,
          density,
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

        if (!rawContent) throw new Error("LLM returned empty content");

        const generatedAt = new Date().toISOString();
        const outputContent = renderHtmlPage(
          subject,
          timelineType,
          density,
          rawContent,
          modelId,
          generatedAt,
          context.globalArgs.branding,
        );
        const wordCount = countWords(rawContent);

        const metadata: z.infer<typeof TimelineSchema> = {
          subject,
          timelineType,
          details: details || undefined,
          density,
          wordCount,
          model: modelId,
          generatedAt,
        };

        return await storeTimeline(
          context,
          metadata,
          outputContent,
          outputDir,
          filename,
        );
      },
    },

    save: {
      description:
        "Store caller-written timeline content without making an LLM call. Wraps tl-phase/tl-event markup in the page shell and writes timeline.html.",
      arguments: z.object({
        subject: z.string().describe("The subject of the timeline"),
        content: z.string().describe(
          "Timeline body HTML — tl-phase and tl-event components only (no html/head/body tags)",
        ),
        timelineType: TimelineTypeSchema.default("biographical"),
        details: z.string().optional(),
        density: DensitySchema.default("standard"),
        model: z.string().default("external").describe(
          "Identifier of whatever produced the content (e.g. 'claude-sonnet-4-6')",
        ),
        outputDir: z.string().optional(),
        filename: z.string().optional(),
      }),
      execute: async (
        args: {
          subject: string;
          content: string;
          timelineType: TimelineType;
          details?: string;
          density: Density;
          model: string;
          outputDir?: string;
          filename?: string;
        },
        context: ModelContext,
      ): Promise<{ dataHandles: unknown[] }> => {
        const {
          subject,
          content,
          timelineType,
          details,
          density,
          model: modelId,
          outputDir,
          filename,
        } = args;

        const generatedAt = new Date().toISOString();
        const outputContent = renderHtmlPage(
          subject,
          timelineType,
          density,
          content,
          modelId,
          generatedAt,
          context.globalArgs.branding,
        );
        const wordCount = countWords(content);

        const metadata: z.infer<typeof TimelineSchema> = {
          subject,
          timelineType,
          details: details || undefined,
          density,
          wordCount,
          model: modelId,
          generatedAt,
        };

        return await storeTimeline(
          context,
          metadata,
          outputContent,
          outputDir,
          filename,
        );
      },
    },
  },
};

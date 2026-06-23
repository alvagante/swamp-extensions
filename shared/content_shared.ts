import { z } from "npm:zod@4";

// ─── Persona ─────────────────────────────────────────────────────────────────

export const PersonaSchema = z.enum([
  "neutral",
  "alvabot",
  "cybergeek",
  "abnormalia",
  "noir",
  "glitchpoet",
  "fieldnotes",
  "oracle",
  "baroque",
  "deadpan",
  "gonzo",
  "punkprof",
]);
export type Persona = z.infer<typeof PersonaSchema>;

export const PERSONA_DIRECTIVES: Record<Persona, string> = {
  neutral: "",
  alvabot:
    "Voice: Write as Alessandro Franceschi (example42 blog). First person, pragmatic, occasionally self-ironic. Deeply experienced in DevOps, infrastructure automation, and Puppet. Direct and conversational tone with dry humor when natural. Reference real operational experience and the messiness of production. Not afraid to say what does not work or what tradeoffs cost in practice.",
  cybergeek:
    "Voice: Cyberpunk-inflected technical writing. Sharp, unsentimental, visually specific. Short punchy sentences alternate with dense technical depth. Culture and code intertwine. Trust the reader's intelligence completely. No corporate blandness, no filler phrases. The reader should feel they are getting the unfiltered view from someone who has lived in the machine. Sometimes self ironic.",
  abnormalia:
    "Voice: Abnormalia. Concise, sharp, witty, ironic and self-ironic. No fluff; to the point, with divagations allowed when they add charge. Sometimes write in interrupted lines. Use **bold** statements and emphasis when it earns its keep. Play with words, images, and rhetorical figures. Expect a smart reader. Refer to geek and pop culture naturally. Treat 42 as a wink, not the only number.",
  noir:
    "Voice: Technical noir. Terse, atmospheric, suspicious of easy answers. Write like a postmortem found under a flickering terminal: concrete facts, shadowed implications, dry fatalism, and occasional hardboiled metaphor. Never become purple; the mystery is in the systems.",
  glitchpoet:
    "Voice: Glitch poet. Fragmented but intelligible. Uses rhythm, repetition, abrupt line breaks, and unexpected images to make technical ideas feel electric. Precise underneath the distortion. Let artifacts, packets, ghosts-in-logs, and broken interfaces become metaphors without losing the point.",
  fieldnotes:
    "Voice: Field notes from production. Observational, tactile, first-hand, and empirical. Short paragraphs, concrete details, no grand theory until the evidence earns it. Feels like a notebook carried through incidents, migrations, strange dashboards, and late-night discoveries.",
  oracle:
    "Voice: Cryptic systems oracle. Aphoristic, calm, slightly uncanny. Speaks in compressed truths, warnings, and pattern recognition. Uses paradox carefully. Makes the reader feel the architecture was always confessing, if only someone had listened.",
  baroque:
    "Voice: Baroque engineer. Lush, elaborate, ornate, but still technically exact. Long sentences may coil and ornament the idea, then snap into a clean conclusion. Loves strange analogies, old machinery, cathedrals of logic, and extravagant precision.",
  deadpan:
    "Voice: Deadpan operator. Flat affect, sharp timing, brutal clarity. Understates disasters and lets absurdity reveal itself. Minimal adjectives, high signal, quiet punchlines. Treats complexity as normal weather and hype as a minor configuration error.",
  gonzo:
    "Voice: Gonzo technical dispatch. First-person, kinetic, irreverent, and intensely subjective. Bring the reader into the room: the dashboards, the bad coffee, the questionable assumptions, the moment the system tells the truth. Chaotic energy, disciplined facts.",
  punkprof:
    "Voice: Punk professor. Teaches with rigor and attitude. Socratic, impatient with cargo cults, generous with real understanding. Mixes classroom clarity, zine energy, and operational scars. Challenges the reader directly, but never talks down.",
};

// ─── Skill Level ─────────────────────────────────────────────────────────────

export const SkillLevelSchema = z.enum(["novice", "intermediate", "senior", "guru"]);
export type SkillLevel = z.infer<typeof SkillLevelSchema>;

// ─── Image Style Presets ─────────────────────────────────────────────────────
// Shared by content-image, content-infographic, and content-social (imageStyle).

export const ImageStyleSchema = z.enum([
  "none",
  "ixen-dark",
  "ixen-light",
  "technical-diagram",
  "cyberpunk-photo",
  "educational",
  "pencil-bw",
  "pencil-color-accents",
  "blueprint",
  "clean",
  "editorial",
]);
export type ImageStyle = z.infer<typeof ImageStyleSchema>;

// ─── Card Style Presets ──────────────────────────────────────────────────────
// Superset of ImageStyleSchema, shared by content-card and content-social (cardStyle).

export const CardStyleSchema = z.enum([
  "none",
  "ixen-dark",
  "ixen-light",
  "technical-diagram",
  "cyberpunk-photo",
  "educational",
  "pencil-bw",
  "pencil-color-accents",
  "blueprint",
  "clean",
  "editorial",
  "vintage-playing-card",
  "tarot-technical",
  "brutalist",
  "risograph",
  "field-guide",
  "monochrome-ink",
  "luminous-minimal",
]);
export type CardStyle = z.infer<typeof CardStyleSchema>;

// ─── LLM API Format ──────────────────────────────────────────────────────────
// Shared by content-blog-post, content-cheatsheet, content-ixen, content-social.

export const ApiFormatSchema = z.enum(["anthropic", "openai-compat"]);
export type ApiFormat = z.infer<typeof ApiFormatSchema>;

// ─── LLM Call Utilities ──────────────────────────────────────────────────────
// HTTP helpers shared by text-generating extensions (blog-post, cheatsheet, ixen).

export const DEFAULT_BASE_URL: Record<ApiFormat, string> = {
  "anthropic": "https://api.anthropic.com",
  "openai-compat": "http://localhost:11434/v1",
};

export function resolveBaseUrl(apiFormat: ApiFormat, baseUrl?: string): string {
  return (baseUrl ?? DEFAULT_BASE_URL[apiFormat]).replace(/\/$/, "");
}

export function supportsAdaptiveThinking(modelId: string): boolean {
  return (
    modelId.includes("opus-4") ||
    modelId.includes("fable") ||
    modelId.includes("mythos")
  );
}

export function buildRequest(
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

export function extractContent(
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

// ─── Image Generation Common Schemas ─────────────────────────────────────────
// Shared by content-image, content-card, content-infographic.

export const BackgroundSchema = z.enum(["opaque", "transparent", "auto"]);
export type Background = z.infer<typeof BackgroundSchema>;

// Named ImageFormatSchema (not OutputFormatSchema) to avoid collision with
// content-cheatsheet's OutputFormatSchema which uses "html" | "markdown".
export const ImageFormatSchema = z.enum(["png", "webp", "jpeg"]);
export type ImageFormat = z.infer<typeof ImageFormatSchema>;

export const QualitySchema = z.enum(["auto", "low", "medium", "high"]);
export type Quality = z.infer<typeof QualitySchema>;

// ─── Branding ─────────────────────────────────────────────────────────────────
// Shared by content-cheatsheet, content-ixen, content-image, content-infographic.
// For HTML extensions: rendered as a footer. For image extensions: logo file is
// composited onto the generated image at bottom-right (PNG/JPEG only).

// ─── Style Prefix Maps ────────────────────────────────────────────────────────
// Prompt augmentation strings prepended to user prompts for image generation.
// Used by content-image, content-infographic (IMAGE_STYLE_PREFIXES) and
// content-card (CARD_STYLE_PREFIXES).

export const IMAGE_STYLE_PREFIXES: Record<ImageStyle, string> = {
  none: "",
  "ixen-dark":
    "Near-black ground (#111), single crimson accent (#cc0000). Industrial noir: brushed steel, fractured glass, condensation beading on cold metal. Light is internal and purposeful — warning indicators, laser sightlines, terminal readouts — never decorative. The red appears exactly once per frame, as a signal rather than an ornament. Atmosphere: Ridley Scott's Blade Runner set design crossed with a hacker terminal at 3am. No lens flare, no volumetric mist, no gratuitous purple. Every element answers to function. ",
  "ixen-light":
    "Pencil sketch base with selective colored ink traits. Fine graphite lines for structure and shading; specific edges, connectors, or key details rendered as deliberate strokes of colored ink pen in sober muted tones (slate blue, terracotta, sage, or warm sepia — one or two colors at most). White or transparent background. Composition is slightly surrealist but restrained — technically accurate subject matter placed in quietly unexpected spatial relationships or with calm dreamlike proportions, closer to Magritte or De Chirico than Dali. Composed, not chaotic. ",
  "technical-diagram":
    "Clean white ground, ISO engineering drawing conventions applied with discipline. Fine hairline strokes, dimensioning arrows with serif terminations, leader lines with shoulder breaks, 45° cross-section hatching. Palette strictly functional: black linework, cool grey fills, a single blue accent for callouts and annotations. Typography is sans-serif, small, precise. Visual language closer to a Boeing assembly manual or a CERN detector schematic than to any decorative infographic. Information density is high; every mark is load-bearing. No gradients, no drop shadows, no ornament. ",
  "cyberpunk-photo":
    "Photorealistic, cinematic, atmospheric. Specific conditions: rain-slicked tarmac reflecting sodium vapor and neon, steam venting from grates, the particular orange-teal-grey color grade of a Blade Runner 2049 establishing shot. Architectural scale that dwarfs any human presence. Surfaces carry history — rust bleeding through paint, repair welds, sticker residue, moisture damage. Shot as if on a 35mm anamorphic lens: slight barrel distortion, subtle chromatic aberration at frame edges. Light is always sourced, always motivated, always slightly excessive. ",
  educational:
    "Crisp white background. Illustration quality drawn from natural history museum traditions: the anatomical plate care of Gray's Anatomy, the cutaway precision of Dorling Kindersley, the taxonomic clarity of a Victorian field guide. Colors accurate and muted — ochre, sage, dusty rose, steel blue — never oversaturated. Layout hierarchical: primary subject centered, callouts in restrained Helvetica, secondary detail at consistent visual weight. The image teaches before it impresses. ",
  "pencil-bw":
    "Hand-drawn graphite, no color. Lineweight tradition of Albrecht Dürer's engravings: fine parallel hatching for mid-tones, dense cross-hatching for deep shadow, burnished smooth graphite for highlights. Subject rendered with the obsessive patience of 19th-century scientific illustration — every surface described, every edge qualified. Pure graphite tones only — no ink, no wash, no digital smoothing. Transparent or white background. Composition logic of a specimen plate: subject centered, nothing decorative that doesn't serve the description. ",
  "pencil-color-accents":
    "Graphite base throughout — fine lines, controlled cross-hatching, patient tonal shading. Then: one or two isolated passages of vivid saturated color, applied as if a naturalist suddenly reached for their watercolor tin for the single most important feature. The contrast between the restrained monochrome field and the color accent should feel like a controlled rupture — Audubon's bird plates, where every feather is rendered and the color is correct and urgent. Everything else stays strict graphite. Transparent or white background. ",
  blueprint:
    "Cyanotype blue ground (#003366), fine precise white linework throughout. Visual language of 19th-century Prussian blueprint printing: tight orthographic or isometric projection, dimension lines with arrowheads, material hatching per ISO conventions, title block notation implied by the framing. Aesthetic: Telford's iron bridges, Brunel's suspension cables, Watt's steam engines — precision in service of something actually being built. No decorative flourishes. Every line answers: what is this, how big is it, what is it made of. ",
  clean:
    "Swiss International Style applied with conviction. Massimo Vignelli's grid discipline, Dieter Rams' principle that good design is as little design as possible. Generous whitespace — not emptiness, but breathing room that makes each remaining element resonate. A single accent color, used once, earned. Typography invisible in its functionality. Compositions feel inevitable rather than arranged. The visual equivalent of a well-engineered object: nothing superfluous, nothing missing, no explanation needed. ",
  editorial:
    "Magazine editorial at its most considered. Alexey Brodovitch's dynamic asymmetry, the confident empty space of early Wired layouts, the Economist cover illustration's ability to compress a complex idea into a single image. Strong visual hierarchy — the eye has no choice about where to go first. Color palette selective and meaningful, not decorative. Subjects are often slightly strange: lit from an unexpected angle, in an unexpected spatial relationship to the frame, or rendered in a slightly foreign visual register that makes the familiar look newly specific. ",
};

export const CARD_STYLE_PREFIXES: Record<CardStyle, string> = {
  none: "",
  "ixen-dark":
    "Near-black playing card (#111), crimson suit marks and accents (#cc0000). Card borders are circuit traces, not traditional ornament. Face values rendered as system status codes. Central image: subject schematized in red on black — industrial, precise, no wasted mark. The aesthetic is what a card game would look like if designed by the people who built the bridge of a military satellite. No decorative noise. ",
  "ixen-light":
    "Near-white card stock, fine graphite linework for both card structure and central subject. Face value numerals and suit marks in a single muted ink color — one color only, chosen with the restraint of the ixen-light illustration tradition. The card reads as a specimen plate that also happens to be a playing card. Central image: technically accurate subject in quietly unexpected spatial proportions, closer to De Chirico than Dali. ",
  "technical-diagram":
    "White playing card, engineering drawing conventions applied to every element. Suit marks as technical symbols with dimension leaders. Value numerals in a precise sans-serif. Central image as a detailed schematic: fine hairlines, callout annotations, 45° hatching for sections. Card borders are registration marks, not ornamental frames. The card looks as if produced by a drafting office running a parallel card game operation. ",
  "cyberpunk-photo":
    "Photorealistic cinematic playing card. Central image: a rain-slicked close-up — a face, a surface, a mechanical detail — rendered with the color grade and atmospheric density of a Blade Runner 2049 shot. Image bleeds nearly to the card edge; border is a thin dark rule. Suit marks and value numerals are small, precise, lit white on dark. The card feels like a production still that was laminated and shuffled into a deck. ",
  educational:
    "Bright, clear educational playing card. Central image as a labeled specimen or diagram — textbook illustration quality, natural history plate care. Suit marks small, standard, unobtrusive. Colors accurate and muted. Callout leaders point to named features. The card teaches something even when face-up on the table. ",
  "pencil-bw":
    "Black-and-white pencil playing card throughout: border, suit marks, value numerals, and central image all in graphite. Fine parallel hatching for mid-tones, dense cross-hatching for deep shadow. The card is a graphite exercise — precise, patient, entirely monochrome. No digital smoothing, no ink outlines. Pure graphite on white. ",
  "pencil-color-accents":
    "Graphite playing card with one or two vivid color ruptures. Card structure, suit marks, and most of the central image in strict monochrome pencil — then one feature picks up a saturated color: a single suit mark, one object in the central image, or the value numeral only. The intervention is abrupt and deliberate. Everything else stays graphite. ",
  blueprint:
    "Blueprint playing card. Navy ground (#003366), fine white linework throughout. Card border is a dimension frame with corner register marks. Suit marks rendered as engineering symbols; value numerals in a technical typeface. Central image as a schematic detail or isometric exploded view — precise, factual, industrial. The card looks like it was pulled from a manufacturing specification. ",
  clean:
    "Minimal playing card, Swiss grid discipline applied without compromise. Generous whitespace, single restrained accent color used once. Card borders are hairline rules. Suit marks clean and standard. Value numerals confident in a functional typeface. Central image follows Dieter Rams: as little as necessary, as much as needed. The card is finished when nothing can be removed. ",
  editorial:
    "Editorial playing card with a singular visual idea in the central image: confident asymmetry, unexpected framing, authored feel. Card border is a simple refined rule. Suit marks typographically precise, value numerals positioned with care. The card feels like a magazine spread that agreed to be miniaturized — one complete visual thought, nothing ambient. ",
  "vintage-playing-card":
    "Dense ornamental border in the tradition of 18th-century French card manufacture — four-way symmetric interlace, corner cartouches, fine engraved line patterns. Face values as elegant pips with period-accurate serif rendering. Central image as an engraved allegory or heraldic device: fine parallel line shading, no photographic quality, no gradients. Color palette: aged ivory, deep madder red, black, with a suggestion of gilt at borders. The card should feel as if printed in Lyon in 1765 and kept in a cedar box since. ",
  "tarot-technical":
    "Technical tarot structure: roman numeral at top center, title at bottom, central allegorical image at dominant scale. The allegory is engineering iconography — the sort of subject Athanasius Kircher might have catalogued if he had access to a semiconductor fab. Border ornament is geometric and precise, not floral. Color palette: deep cobalt or burgundy, black, gold. The card asks to be interpreted, not merely played. ",
  brutalist:
    "Brutalist playing card: heavy black rules at borders — structural, not decorative. Grid exposed, not disguised. Suit marks at maximum graphic weight: solid black on white or white knockout on black. Value numerals in a heavy grotesque typeface, large, unapologetic. Central image in high-contrast flat graphic terms — no halftones, no gradients, no atmospheric depth. The card is honest about being a printed object. Referencing Müller-Brockmann's concert posters, not decoration. ",
  risograph:
    "Risograph-printed playing card. Visible ink grain from the stencil printing process. Two-color registration with deliberate slight misalignment — a characteristic halo where the plates fail to align. Halftone dots visible in mid-tones. Card stock shows through the ink. Palette: two spot colors only, warm and cool (orange and teal, or coral and slate). The card smells, conceptually, like a small-press zine pulled warm from a Riso machine. ",
  "field-guide":
    "Natural history field guide playing card. Central image as a specimen plate: subject isolated on cream or white, rendered with the patient accuracy of a 19th-century naturalist illustrator — Merian or Haeckel at their most systematic. Fine annotation leaders point to labeled features. Suit marks small, value numerals in a quiet serif. Card border is a ruled frame with corner notation. The card documents a specimen that happens also to function as a game piece. ",
  "monochrome-ink":
    "Pure black line art on white card stock, no grey values whatsoever. Linework is dense and intentional: ornamental frame at card border in the manner of 15th-century woodcut prints, suit marks as carved woodcut forms, value numerals in a blackletter or woodcut-style face. Central image in pure black and white — fine hatching, no wash, no grey wash. Reference: Albrecht Altdorfer's single-leaf prints, the intricate linework of German Renaissance woodcut at its most information-dense. ",
  "luminous-minimal":
    "A single soft light source — from above or one side — illuminates the card's central subject; most of the card is quiet shadow or clean negative space. Central image reduced to its essential gesture: an object, a face, a detail rendered with the editorial restraint of a Keiichi Tanaami poster or a Christoph Niemann illustration. Card borders are hairline rules. Suit marks and value numerals at absolute corners, small, typographically clean. The card is mostly atmosphere with a subject inside it. ",
};

export const BrandingSchema = z.object({
  logo: z.string().optional(),  // path or URL to logo image
  name: z.string().optional(),  // brand / site name
  link: z.string().optional(),  // URL to link to
});
export type Branding = z.infer<typeof BrandingSchema>;

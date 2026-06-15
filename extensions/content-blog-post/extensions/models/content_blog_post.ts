import { z } from "npm:zod@4";

const SkillLevelSchema = z.enum(["novice", "intermediate", "senior", "guru"]);
const OutputLengthSchema = z.enum(["short", "medium", "long"]);
const PersonaSchema = z.enum(["neutral", "alvabot", "abnormalia"]);
const ApiFormatSchema = z.enum(["anthropic", "openai-compat"]);

type SkillLevel = z.infer<typeof SkillLevelSchema>;
type OutputLength = z.infer<typeof OutputLengthSchema>;
type Persona = z.infer<typeof PersonaSchema>;
type ApiFormat = z.infer<typeof ApiFormatSchema>;

const PostSchema = z.object({
  title: z.string(),
  content: z.string(),
  wordCount: z.number().int().nonnegative(),
  topic: z.string(),
  details: z.string().optional(),
  skillLevel: SkillLevelSchema,
  outputLength: OutputLengthSchema,
  model: z.string(),
  persona: PersonaSchema,
  personaDescription: z.string().optional(),
  generatedAt: z.string(),
});

type ModelContext = {
  globalArgs: {
    apiFormat: ApiFormat;
    apiKey?: string;
    baseUrl?: string;
  };
  writeResource: (
    specName: "post",
    name: string,
    content: unknown,
  ) => Promise<unknown>;
  createFileWriter: (
    specName: "markdown",
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
    "Skill level: NOVICE\nWrite for readers with no prior technical knowledge. Define every term on first use. Use concrete analogies from everyday life. Avoid unexplained acronyms. Guide the reader toward practical first steps and point to resources for continuing.",
  intermediate:
    "Skill level: INTERMEDIATE\nWrite for developers who understand the fundamentals. Use standard terminology without defining basics. Build one layer deeper than introductory content. Include concrete examples and real-world implications.",
  senior:
    "Skill level: SENIOR\nWrite for experienced engineers. Skip fundamentals entirely. Assume deep domain familiarity. Engage with tradeoffs, edge cases, production concerns, failure modes, and architectural decisions. Be direct and precise — no padding.",
  guru:
    "Skill level: GURU\nWrite for domain experts and active practitioners at the frontier. Treat the reader as a peer. Engage with nuance, contested ideas, emerging patterns, second-order effects, and open problems. Dense technical depth is expected and welcome. No hand-holding.",
};

const PERSONA_DIRECTIVES: Record<string, string> = {
  neutral: "",
  alvabot:
    "Voice: Write as Alessandro Franceschi (example42 blog). First person, pragmatic, occasionally self-ironic. Deeply experienced in DevOps, infrastructure automation, and Puppet. Direct and conversational tone with dry humor when natural. Reference real operational experience and the messiness of production. Not afraid to say what does not work or what tradeoffs cost in practice.",
  abnormalia:
    "Voice: Cyberpunk-inflected technical writing. Sharp, unsentimental, visually specific. Short punchy sentences alternate with dense technical depth. Culture and code intertwine. Trust the reader's intelligence completely. No corporate blandness, no filler phrases. The reader should feel they are getting the unfiltered view from someone who has lived in the machine.",
};

const MAX_TOKENS: Record<string, number> = {
  short: 1500,
  medium: 3500,
  long: 7000,
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

function buildSystemPrompt(
  skillLevel: SkillLevel,
  persona: Persona,
  personaDescription?: string,
): string {
  const parts = [
    `You are a technical blog post writer. Write a single, complete, publication-ready blog post.

Format rules:
- First line: the post title (plain text only — no "Title:" prefix, no leading # marker)
- Then a blank line
- Then the full post body in Markdown (use headers, code blocks, and lists where they genuinely help)
- No preamble, no meta-commentary, no closing remarks — output only the post itself`,
    SKILL_LEVEL_DIRECTIVES[skillLevel],
  ];

  const personaDirective = personaDescription
    ? `Voice: ${personaDescription.trim()}`
    : PERSONA_DIRECTIVES[persona];
  if (personaDirective) {
    parts.push(personaDirective);
  }

  return parts.join("\n\n");
}

function buildUserMessage(topic: string, details?: string): string {
  if (!details) {
    return `Write a blog post about: ${topic}`;
  }
  return `Write a blog post about: ${topic}\n\nAdditional context and requirements:\n${details}`;
}

function extractTitle(content: string, fallback: string): string {
  const firstLine = content.split("\n")[0] ?? "";
  const title = firstLine.replace(/^#+\s*/, "").trim();
  return title || fallback;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function deriveOutputLength(wordCount: number): OutputLength {
  if (wordCount < 1000) return "short";
  if (wordCount < 2500) return "medium";
  return "long";
}

async function storePost(
  context: ModelContext,
  post: z.infer<typeof PostSchema>,
): Promise<{ dataHandles: unknown[] }> {
  const postHandle = await context.writeResource("post", "post", post);

  const writer = context.createFileWriter("markdown", "markdown");
  const fileHandle = await writer.writeText(post.content);

  context.logger.info(
    "Blog post stored: {title} ({wordCount} words)",
    { title: post.title, wordCount: post.wordCount },
  );

  return { dataHandles: [postHandle, fileHandle] };
}

/**
 * Blog post generator that calls any compatible LLM inference endpoint.
 *
 * Supports Anthropic's Messages API and any OpenAI-compatible endpoint
 * (Ollama, vLLM, Groq, Together, OpenRouter, etc.). Accepts a topic, optional
 * details, skill level, output length, persona, and model ID. Returns a
 * structured `post` resource (title, content, wordCount, metadata) and a
 * `markdown` file containing the publication-ready post.
 *
 * Two entry points: `generate` calls the configured inference endpoint
 * (requires endpoint config), while `save` stores a post written by the
 * caller — e.g. a coding agent driving swamp — with no inference call and
 * no API key.
 */
export const model = {
  type: "@alvagante/content-blog-post",
  version: "2026.06.12.1",
  globalArguments: z.object({
    apiFormat: ApiFormatSchema.default("anthropic"),
    apiKey: z.string().optional().meta({ sensitive: true }),
    baseUrl: z.string().optional(),
  }),
  upgrades: [
    {
      toVersion: "2026.06.12.1",
      description:
        "Add keyless save method and custom persona descriptions; no globalArguments schema changes",
      upgradeAttributes: (old: Record<string, unknown>) => old,
    },
  ],
  resources: {
    post: {
      description: "Generated blog post metadata and content",
      schema: PostSchema,
      lifetime: "infinite",
      garbageCollection: 20,
    },
  },
  files: {
    markdown: {
      description: "Generated blog post in Markdown format",
      contentType: "text/markdown",
      lifetime: "infinite",
      garbageCollection: 20,
    },
  },
  methods: {
    generate: {
      description:
        "Generate a blog post on the given topic using a configured LLM endpoint",
      arguments: z.object({
        topic: z.string().min(1),
        details: z.string().optional(),
        skillLevel: SkillLevelSchema.default("intermediate"),
        outputLength: OutputLengthSchema.default("medium"),
        model: z.string().default("claude-opus-4-8"),
        persona: PersonaSchema.default("neutral"),
        personaDescription: z.string().min(1).optional(),
      }),
      execute: async (
        args: {
          topic: string;
          details?: string;
          skillLevel: SkillLevel;
          outputLength: OutputLength;
          model: string;
          persona: Persona;
          personaDescription?: string;
        },
        context: ModelContext,
      ) => {
        const { apiFormat, apiKey, baseUrl: rawBaseUrl } = context.globalArgs;

        if (apiFormat === "anthropic" && !apiKey) {
          throw new Error(
            "apiKey is required when apiFormat is 'anthropic'",
          );
        }

        context.logger.info("Generating blog post on {topic}", {
          topic: args.topic,
          skillLevel: args.skillLevel,
          outputLength: args.outputLength,
          model: args.model,
          persona: args.persona,
          apiFormat,
        });

        const systemPrompt = buildSystemPrompt(
          args.skillLevel,
          args.persona,
          args.personaDescription,
        );
        const userMessage = buildUserMessage(args.topic, args.details);
        const maxTokens = MAX_TOKENS[args.outputLength] ?? 3500;
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
        const { text: content, stopReason } = extractContent(
          apiFormat,
          responseJson,
        );

        if (!content) {
          throw new Error(
            `No text content in API response (stop_reason: ${stopReason})`,
          );
        }

        const title = extractTitle(content, args.topic);
        const wordCount = countWords(content);

        return await storePost(context, {
          title,
          content,
          wordCount,
          topic: args.topic,
          details: args.details,
          skillLevel: args.skillLevel,
          outputLength: args.outputLength,
          model: args.model,
          persona: args.persona,
          personaDescription: args.personaDescription,
          generatedAt: new Date().toISOString(),
        });
      },
    },
    save: {
      description:
        "Store an externally generated blog post (e.g. written by the calling agent) without making any inference call — no API key or endpoint required",
      arguments: z.object({
        content: z.string().min(1),
        title: z.string().optional(),
        topic: z.string().min(1),
        details: z.string().optional(),
        skillLevel: SkillLevelSchema.default("intermediate"),
        outputLength: OutputLengthSchema.optional(),
        model: z.string().default("external"),
        persona: PersonaSchema.default("neutral"),
        personaDescription: z.string().min(1).optional(),
      }),
      execute: async (
        args: {
          content: string;
          title?: string;
          topic: string;
          details?: string;
          skillLevel: SkillLevel;
          outputLength?: OutputLength;
          model: string;
          persona: Persona;
          personaDescription?: string;
        },
        context: ModelContext,
      ) => {
        const title = args.title ?? extractTitle(args.content, args.topic);
        const wordCount = countWords(args.content);
        const outputLength = args.outputLength ??
          deriveOutputLength(wordCount);

        context.logger.info("Saving externally generated blog post", {
          topic: args.topic,
          wordCount,
          persona: args.persona,
        });

        return await storePost(context, {
          title,
          content: args.content,
          wordCount,
          topic: args.topic,
          details: args.details,
          skillLevel: args.skillLevel,
          outputLength,
          model: args.model,
          persona: args.persona,
          personaDescription: args.personaDescription,
          generatedAt: new Date().toISOString(),
        });
      },
    },
  },
};

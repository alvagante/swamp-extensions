import { model as instagramModel } from "./content_social_instagram.ts";
import { model as xModel } from "./content_social_x.ts";

type TestSocialModel = {
  methods: {
    generate: {
      execute: (args: Record<string, unknown>, context: unknown) => Promise<
        unknown
      >;
    };
    save: {
      execute: (args: Record<string, unknown>, context: unknown) => Promise<
        unknown
      >;
    };
  };
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const instagramSocialModel = instagramModel as TestSocialModel;
const xSocialModel = xModel as TestSocialModel;

function createContext(resources: unknown[] = []) {
  const writes: Array<{ specName: string; text: string }> = [];
  return {
    context: {
      globalArgs: {
        apiFormat: "anthropic" as const,
        apiKey: "test-key",
      },
      writeResource: (_specName: string, _name: string, content: unknown) => {
        resources.push(content);
        return Promise.resolve({ resource: true });
      },
      createFileWriter: (specName: string) => ({
        writeText: (text: string) => {
          writes.push({ specName, text });
          return Promise.resolve({ file: true });
        },
      }),
      logger: {
        info: () => {},
        error: () => {},
      },
    },
    writes,
  };
}

Deno.test("x generate calls inference and stores short post", async () => {
  const originalFetch = globalThis.fetch;
  const resources: unknown[] = [];
  const { context, writes } = createContext(resources);

  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    assert(
      String(url) === "https://api.anthropic.com/v1/messages",
      "expected Anthropic messages URL",
    );
    const body = JSON.parse(String(init?.body));
    assert(body.system.includes("X"), "expected X-specific system prompt");
    assert(
      String(body.messages[0].content).includes("Target characters: 220"),
      "expected X target characters",
    );
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          content: [{
            type: "text",
            text: JSON.stringify({
              title: "Puppet drift",
              text:
                "Configuration drift is not entropy. It is unreviewed design.",
              shortText: "Drift is unreviewed design.",
              hashtags: ["Puppet", "#DevOps"],
            }),
          }],
          stop_reason: "end_turn",
        }),
    } as Response);
  }) as typeof fetch;

  try {
    await xSocialModel.methods.generate.execute(
      {
        topic: "Puppet drift",
        contentKind: "short",
        persona: "alvabot",
        hashtags: [],
        mentions: [],
        includeTags: true,
        mediaAssets: [],
        mediaMode: "auto",
        cardStyle: "vintage-playing-card",
        imageStyle: "none",
        strictLength: false,
        model: "claude-opus-4-8",
      },
      context,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  const post = resources[0] as {
    platform?: string;
    text?: string;
    hashtags?: string[];
    mediaRequests?: unknown[];
    targetCharacters?: number;
  };
  assert(post.platform === "X", "expected X platform");
  assert(post.targetCharacters === 220, "expected X short target");
  assert(post.text?.includes("Drift"), "expected generated text");
  assert(post.hashtags?.includes("#Puppet"), "expected normalized hashtag");
  assert(post.mediaRequests?.length === 0, "expected no media request");
  assert(writes[0]?.text === post.text, "expected copy file text");
});

Deno.test("instagram save creates content-image media request when media is missing", async () => {
  const resources: unknown[] = [];
  const { context } = createContext(resources);

  await instagramSocialModel.methods.save.execute(
    {
      text:
        "Puppet catalogs look boring until production teaches you otherwise.",
      topic: "Puppet catalogs",
      contentKind: "text-image",
      persona: "abnormalia",
      hashtags: ["puppet", "#infra"],
      mentions: ["example42"],
      includeTags: true,
      mediaAssets: [],
      mediaMode: "auto",
      mediaPrompt: "A dramatic technical diagram of Puppet catalog compilation",
      cardStyle: "vintage-playing-card",
      imageStyle: "technical-diagram",
      strictLength: false,
      model: "external",
    },
    context,
  );

  const post = resources[0] as {
    platform?: string;
    text?: string;
    mediaRequests?: Array<{
      modelType?: string;
      arguments?: Record<string, unknown>;
    }>;
  };
  assert(post.platform === "Instagram", "expected Instagram platform");
  assert(post.text?.includes("@example42"), "expected mention appended");
  assert(post.text?.includes("#puppet"), "expected hashtag appended");
  assert(post.mediaRequests?.length === 1, "expected one media request");
  assert(
    post.mediaRequests?.[0]?.modelType === "@alvagante/content-image",
    "expected content-image request",
  );
  assert(
    post.mediaRequests?.[0]?.arguments?.style === "technical-diagram",
    "expected image style in media request",
  );
});

Deno.test("instagram save creates content-card media request for cards", async () => {
  const resources: unknown[] = [];
  const { context } = createContext(resources);

  await instagramSocialModel.methods.save.execute(
    {
      text: "One card. One uncomfortable infrastructure truth.",
      title: "Catalog Truth",
      topic: "Puppet catalog compilation",
      contentKind: "cards",
      persona: "neutral",
      hashtags: [],
      mentions: [],
      includeTags: true,
      mediaAssets: [],
      mediaMode: "auto",
      mediaPrompt: "Puppet catalog compilation as a collectible technical card",
      cardStyle: "tarot-technical",
      imageStyle: "none",
      strictLength: false,
      model: "external",
    },
    context,
  );

  const post = resources[0] as {
    mediaRequests?: Array<{
      modelType?: string;
      arguments?: Record<string, unknown>;
    }>;
  };
  assert(
    post.mediaRequests?.[0]?.modelType === "@alvagante/content-card",
    "expected content-card request",
  );
  assert(
    post.mediaRequests?.[0]?.arguments?.style === "tarot-technical",
    "expected card style in media request",
  );
});

Deno.test("strictLength rejects over-target posts before writing", async () => {
  const resources: unknown[] = [];
  const { context } = createContext(resources);

  let rejected = false;
  try {
    await xSocialModel.methods.save.execute(
      {
        text: "This post is intentionally too long.",
        contentKind: "short",
        persona: "neutral",
        hashtags: [],
        mentions: [],
        includeTags: true,
        mediaAssets: [],
        mediaMode: "none",
        cardStyle: "vintage-playing-card",
        imageStyle: "none",
        maxCharacters: 5,
        strictLength: true,
        model: "external",
      },
      context,
    );
  } catch (error) {
    rejected = error instanceof Error &&
      error.message.includes("above strict target");
  }

  assert(rejected, "expected strict length rejection");
  assert(resources.length === 0, "expected no resource writes");
});

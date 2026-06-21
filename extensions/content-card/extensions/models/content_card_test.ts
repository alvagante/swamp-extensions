import { model } from "./content_card.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("generate writes card image and metadata", async () => {
  const originalFetch = globalThis.fetch;
  const outputDir = await Deno.makeTempDir({ prefix: "content-card-" });
  const resources: unknown[] = [];
  const fileWrites: Array<{ kind: string; value: unknown }> = [];

  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    assert(
      String(url) === "https://api.openai.com/v1/images/generations",
      "expected OpenAI Images API URL",
    );
    const body = JSON.parse(String(init?.body));
    assert(body.model === "gpt-image-1.5", "expected default image model");
    assert(body.size === "1024x1536", "expected default card size");
    assert(
      body.prompt.includes("playing card"),
      "expected playing-card prompt",
    );
    assert(
      body.prompt.includes('Print "3" in the top-right corner'),
      "expected senior skill value in top-right prompt",
    );
    assert(
      body.prompt.includes('print only "7" in the top-left corner'),
      "expected card number in top-left prompt",
    );
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [{ b64_json: "AQID", revised_prompt: "revised card" }],
        }),
    } as Response);
  }) as typeof fetch;

  const context = {
    globalArgs: { apiKey: "test-key" },
    writeResource: (_specName: string, _name: string, content: unknown) => {
      resources.push(content);
      return Promise.resolve({ resource: true });
    },
    createFileWriter: (specName: string) => ({
      writeAll: (bytes: Uint8Array) => {
        fileWrites.push({ kind: `${specName}:bytes`, value: [...bytes] });
        return Promise.resolve({ bytes: true });
      },
    }),
    logger: {
      info: () => {},
      error: () => {},
    },
  };

  try {
    await model.methods.generate.execute(
      {
        prompt: "Puppet catalog compilation as a graph of resources and edges",
        title: "Catalog",
        text: "Facts become graph. Graph becomes change.",
        cardNumber: 7,
        cardCount: 12,
        skillLevel: "senior",
        cornerIcon: "directed graph node icon",
        logo: "example42 wordmark",
        style: "tarot-technical",
        model: "gpt-image-1.5",
        background: "opaque",
        size: "1024x1536",
        quality: "auto",
        format: "png",
        filename: "catalog-card.png",
        outputDir,
      },
      context,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  const metadata = resources[0] as {
    filename?: string;
    skillLevel?: string;
    skillValue?: number;
    revisedPrompt?: string;
    outputPath?: string;
  };
  assert(metadata.filename === "catalog-card.png", "expected filename");
  assert(metadata.skillLevel === "senior", "expected skill level");
  assert(metadata.skillValue === 3, "expected senior skill value");
  assert(metadata.revisedPrompt === "revised card", "expected revised prompt");
  assert(
    metadata.outputPath === `${outputDir}/catalog-card.png`,
    "expected output path",
  );
  assert(
    fileWrites.some((write) => write.kind === "imageFile:bytes"),
    "expected image file write",
  );

  const image = await Deno.readFile(`${outputDir}/catalog-card.png`);
  assert(image.length === 3, "expected image bytes in outputDir");
});

Deno.test("generate rejects card number above card count before API call", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;

  globalThis.fetch = (() => {
    fetchCalled = true;
    return Promise.resolve({ ok: true } as Response);
  }) as typeof fetch;

  const context = {
    globalArgs: { apiKey: "test-key" },
    writeResource: () => Promise.resolve({}),
    createFileWriter: () => ({
      writeAll: () => Promise.resolve({}),
    }),
    logger: {
      info: () => {},
      error: () => {},
    },
  };

  try {
    let error: unknown;
    try {
      await model.methods.generate.execute(
        {
          prompt: "Puppet environments",
          cardNumber: 5,
          cardCount: 4,
          skillLevel: "intermediate",
          style: "vintage-playing-card",
          model: "gpt-image-1.5",
          background: "opaque",
          size: "1024x1536",
          quality: "auto",
          format: "png",
        },
        context,
      );
    } catch (caught) {
      error = caught;
    }

    assert(error instanceof Error, "expected validation error");
    assert(
      error.message.includes("cardNumber cannot be greater than cardCount"),
      "expected card count validation message",
    );
    assert(!fetchCalled, "expected no API call");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("generate rejects OpenAI errors before writing", async () => {
  const originalFetch = globalThis.fetch;
  let writeCount = 0;

  globalThis.fetch = (() =>
    Promise.resolve({
      ok: false,
      status: 429,
      headers: new Headers(),
      text: () => Promise.resolve("rate limited"),
    } as Response)) as typeof fetch;

  const context = {
    globalArgs: { apiKey: "test-key" },
    writeResource: () => {
      writeCount++;
      return Promise.resolve({});
    },
    createFileWriter: () => ({
      writeAll: () => {
        writeCount++;
        return Promise.resolve({});
      },
    }),
    logger: {
      info: () => {},
      error: () => {},
    },
  };

  try {
    let error: unknown;
    try {
      await model.methods.generate.execute(
        {
          prompt: "Puppet environments",
          cardNumber: 1,
          skillLevel: "intermediate",
          style: "vintage-playing-card",
          model: "gpt-image-1.5",
          background: "opaque",
          size: "1024x1536",
          quality: "auto",
          format: "png",
        },
        context,
      );
    } catch (caught) {
      error = caught;
    }

    assert(error instanceof Error, "expected OpenAI API failure");
    assert(
      error.message.includes("OpenAI Images API error 429"),
      "expected status in error",
    );
    assert(writeCount === 0, "expected no writes after API error");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

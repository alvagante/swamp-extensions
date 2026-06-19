import { model } from "./content_infographic.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("generate writes infographic image, HTML, and metadata", async () => {
  const originalFetch = globalThis.fetch;
  const outputDir = await Deno.makeTempDir({ prefix: "content-infographic-" });
  const resources: unknown[] = [];
  const fileWrites: Array<{ kind: string; value: unknown }> = [];

  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    assert(
      String(url) === "https://api.openai.com/v1/images/generations",
      "expected OpenAI Images API URL",
    );
    const body = JSON.parse(String(init?.body));
    assert(body.model === "gpt-image-2", "expected default image model");
    assert(
      body.prompt.includes("Puppet Catalog Infographic"),
      "expected title in prompt",
    );
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [{ b64_json: "AQID", revised_prompt: "revised" }],
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
      writeText: (text: string) => {
        fileWrites.push({ kind: `${specName}:text`, value: text });
        return Promise.resolve({ text: true });
      },
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
        topic: "Puppet catalog compilation",
        title: "Puppet Catalog Infographic",
        details: "Compile phases, containment, resources, and edges.",
        keyPoints: ["Facts enter", "Catalog compiles", "Agent applies"],
        style: "technical",
        orientation: "wide",
        model: "gpt-image-2",
        background: "opaque",
        quality: "auto",
        format: "png",
        filename: "catalog.png",
        htmlFilename: "catalog-infographic.html",
        outputDir,
      },
      context,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  const metadata = resources[0] as {
    filename?: string;
    htmlFilename?: string;
    revisedPrompt?: string;
  };
  assert(metadata.filename === "catalog.png", "expected metadata filename");
  assert(
    metadata.htmlFilename === "catalog-infographic.html",
    "expected metadata html filename",
  );
  assert(metadata.revisedPrompt === "revised", "expected revised prompt");
  assert(
    fileWrites.some((write) => write.kind === "imageFile:bytes"),
    "expected image file write",
  );
  assert(
    fileWrites.some((write) =>
      write.kind === "html:text" &&
      String(write.value).includes("@alvagante/content-infographic")
    ),
    "expected HTML file write",
  );

  const image = await Deno.readFile(`${outputDir}/catalog.png`);
  const html = await Deno.readTextFile(`${outputDir}/catalog-infographic.html`);
  assert(image.length === 3, "expected image bytes in outputDir");
  assert(
    html.includes('<img src="./catalog.png"'),
    "expected relative image reference",
  );
});

Deno.test("generate rejects OpenAI errors before writing", async () => {
  const originalFetch = globalThis.fetch;
  let writeCount = 0;

  globalThis.fetch = (() =>
    Promise.resolve({
      ok: false,
      status: 429,
      text: () => Promise.resolve("rate limited"),
    } as Response)) as typeof fetch;

  const context = {
    globalArgs: { apiKey: "test-key" },
    writeResource: () => {
      writeCount++;
      return Promise.resolve({});
    },
    createFileWriter: () => ({
      writeText: () => {
        writeCount++;
        return Promise.resolve({});
      },
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
          topic: "Puppet catalog compilation",
          keyPoints: [],
          style: "technical",
          orientation: "wide",
          model: "gpt-image-2",
          background: "opaque",
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

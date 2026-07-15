import UPNG from "npm:upng-js@2.1.0";
import { model } from "./content_infographic.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function solidPng(width: number, height: number, rgba: number[]): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set(rgba, i);
  return new Uint8Array(
    UPNG.encode([pixels.buffer as ArrayBuffer], width, height, 0),
  );
}

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

Deno.test("generate composites branding logo onto PNG output", async () => {
  const originalFetch = globalThis.fetch;
  const outputDir = await Deno.makeTempDir({ prefix: "content-infographic-" });
  const basePng = solidPng(64, 64, [255, 0, 0, 255]);
  const logoPath = `${outputDir}/logo.png`;
  await Deno.writeFile(logoPath, solidPng(16, 16, [0, 0, 255, 255]));

  globalThis.fetch = (() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [{ b64_json: toBase64(basePng) }],
        }),
    } as Response)) as typeof fetch;

  const context = {
    globalArgs: {
      apiKey: "test-key",
      branding: {
        logo: logoPath,
        name: "test",
        link: "https://example.com",
      },
    },
    writeResource: () => Promise.resolve({}),
    createFileWriter: () => ({
      writeText: () => Promise.resolve({}),
      writeAll: () => Promise.resolve({}),
    }),
    logger: {
      info: () => {},
      error: () => {},
    },
  };

  try {
    await model.methods.generate.execute(
      {
        topic: "Test topic",
        title: "Test Infographic",
        keyPoints: [],
        style: "technical-diagram",
        orientation: "wide",
        model: "gpt-image-2",
        background: "opaque",
        quality: "auto",
        format: "png",
        filename: "branded.png",
        emitHtml: true,
        htmlFilename: "branded-infographic.html",
        outputDir,
      },
      context,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  const written = await Deno.readFile(`${outputDir}/branded.png`);
  const decoded = UPNG.decode(
    written.buffer.slice(
      written.byteOffset,
      written.byteOffset + written.byteLength,
    ) as ArrayBuffer,
  );
  assert(
    decoded.width === 64 && decoded.height === 64,
    "expected 64x64 output",
  );
  const rgba = new Uint8Array(UPNG.toRGBA8(decoded)[0]);
  // Logo target width: round(64 * 0.12) = 8, placed at (64-8-16, 64-8-16) = (40, 40).
  const logoPixel = (43 * 64 + 43) * 4;
  assert(
    rgba[logoPixel] === 0 && rgba[logoPixel + 2] === 255,
    "expected blue logo pixel in overlay region",
  );
  const basePixel = (8 * 64 + 8) * 4;
  assert(
    rgba[basePixel] === 255 && rgba[basePixel + 2] === 0,
    "expected untouched red base pixel outside overlay",
  );
});

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
    assert(body.background === "opaque", "expected background setting");
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
        style: "technical-diagram",
        orientation: "wide",
        model: "gpt-image-2",
        background: "opaque",
        quality: "auto",
        format: "png",
        filename: "catalog.png",
        emitHtml: true,
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
    html.includes('src="./catalog.png"'),
    "expected relative image reference",
  );
});

Deno.test("generate skips the HTML file when emitHtml is false", async () => {
  const originalFetch = globalThis.fetch;
  const outputDir = await Deno.makeTempDir({ prefix: "content-infographic-" });
  const resources: unknown[] = [];
  const fileWrites: Array<{ kind: string; value: unknown }> = [];

  globalThis.fetch = (() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [{ b64_json: "AQID" }],
        }),
    } as Response)) as typeof fetch;

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
        keyPoints: [],
        style: "technical-diagram",
        orientation: "wide",
        model: "gpt-image-2",
        background: "opaque",
        quality: "auto",
        format: "png",
        filename: "catalog.png",
        emitHtml: false,
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
  };
  assert(metadata.filename === "catalog.png", "expected metadata filename");
  assert(
    metadata.htmlFilename === undefined,
    "expected no html filename in metadata",
  );
  assert(
    !fileWrites.some((write) => write.kind === "html:text"),
    "expected no HTML file write",
  );
  assert(
    fileWrites.some((write) => write.kind === "imageFile:bytes"),
    "expected image file write",
  );

  const image = await Deno.readFile(`${outputDir}/catalog.png`);
  assert(image.length === 3, "expected image bytes in outputDir");
  let htmlExists = true;
  try {
    await Deno.stat(`${outputDir}/catalog-infographic.html`);
  } catch {
    htmlExists = false;
  }
  assert(!htmlExists, "expected no HTML file written to outputDir");
});

Deno.test("save writes HTML by default and skips it when emitHtml is false", async () => {
  const outputDir = await Deno.makeTempDir({ prefix: "content-infographic-" });
  const basePng = solidPng(4, 4, [10, 20, 30, 255]);
  const imageBase64 = toBase64(basePng);

  function makeContext() {
    const resources: unknown[] = [];
    const fileWrites: Array<{ kind: string }> = [];
    return {
      context: {
        globalArgs: {},
        writeResource: (_specName: string, _name: string, content: unknown) => {
          resources.push(content);
          return Promise.resolve({ resource: true });
        },
        createFileWriter: (specName: string) => ({
          writeText: () => {
            fileWrites.push({ kind: `${specName}:text` });
            return Promise.resolve({ text: true });
          },
          writeAll: () => {
            fileWrites.push({ kind: `${specName}:bytes` });
            return Promise.resolve({ bytes: true });
          },
        }),
        logger: { info: () => {}, error: () => {} },
      },
      resources,
      fileWrites,
    };
  }

  const withHtml = makeContext();
  await model.methods.save.execute(
    {
      topic: "External infographic",
      title: "External Infographic",
      keyPoints: [],
      imageBase64,
      style: "clean",
      orientation: "wide",
      background: "opaque",
      quality: "auto",
      format: "png",
      filename: "external.png",
      emitHtml: true,
      model: "external",
      outputDir,
    },
    withHtml.context,
  );
  assert(
    withHtml.fileWrites.some((write) => write.kind === "html:text"),
    "expected HTML file write when emitHtml is true",
  );
  const metadataWithHtml = withHtml.resources[0] as { htmlFilename?: string };
  assert(
    typeof metadataWithHtml.htmlFilename === "string",
    "expected html filename in metadata when emitHtml is true",
  );

  const withoutHtml = makeContext();
  await model.methods.save.execute(
    {
      topic: "External infographic",
      title: "External Infographic",
      keyPoints: [],
      imageBase64,
      style: "clean",
      orientation: "wide",
      background: "opaque",
      quality: "auto",
      format: "png",
      filename: "external-no-html.png",
      emitHtml: false,
      model: "external",
      outputDir,
    },
    withoutHtml.context,
  );
  assert(
    !withoutHtml.fileWrites.some((write) => write.kind === "html:text"),
    "expected no HTML file write when emitHtml is false",
  );
  const metadataWithoutHtml = withoutHtml.resources[0] as {
    htmlFilename?: string;
  };
  assert(
    metadataWithoutHtml.htmlFilename === undefined,
    "expected no html filename in metadata when emitHtml is false",
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
          style: "technical-diagram",
          orientation: "wide",
          model: "gpt-image-2",
          background: "opaque",
          quality: "auto",
          format: "png",
          emitHtml: true,
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

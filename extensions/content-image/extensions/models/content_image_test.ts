import UPNG from "npm:upng-js@2.1.0";
import { model } from "./content_image.ts";

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

function makeContext(outputDir: string) {
  const resources: unknown[] = [];
  const fileWrites: Array<{ kind: string; bytes: Uint8Array }> = [];
  const context = {
    globalArgs: {
      apiKey: "test-key",
    } as Record<string, unknown>,
    writeResource: (_specName: string, _name: string, content: unknown) => {
      resources.push(content);
      return Promise.resolve({ resource: true });
    },
    createFileWriter: (specName: string) => ({
      writeAll: (bytes: Uint8Array) => {
        fileWrites.push({ kind: `${specName}:bytes`, bytes });
        return Promise.resolve({ bytes: true });
      },
    }),
    logger: {
      info: () => {},
      error: () => {},
    },
  };
  void outputDir;
  return { context, resources, fileWrites };
}

Deno.test("generate writes image file and metadata", async () => {
  const originalFetch = globalThis.fetch;
  const outputDir = await Deno.makeTempDir({ prefix: "content-image-" });
  const { context, resources, fileWrites } = makeContext(outputDir);

  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    assert(
      String(url) === "https://api.openai.com/v1/images/generations",
      "expected OpenAI Images API URL",
    );
    const body = JSON.parse(String(init?.body));
    assert(body.model === "gpt-image-1.5", "expected requested model");
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [{ b64_json: "AQID", revised_prompt: "revised" }],
        }),
    } as Response);
  }) as typeof fetch;

  try {
    await model.methods.generate.execute(
      {
        prompt: "A test pattern",
        style: "none",
        model: "gpt-image-1.5",
        background: "opaque",
        size: "1024x1024",
        quality: "auto",
        format: "png",
        filename: "test.png",
        outputDir,
      },
      context,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  const metadata = resources[0] as {
    filename?: string;
    revisedPrompt?: string;
    outputPath?: string;
  };
  assert(metadata.filename === "test.png", "expected metadata filename");
  assert(metadata.revisedPrompt === "revised", "expected revised prompt");
  assert(
    fileWrites.some((write) => write.kind === "imageFile:bytes"),
    "expected image file write",
  );
  const written = await Deno.readFile(`${outputDir}/test.png`);
  assert(written.length === 3, "expected raw image bytes in outputDir");
});

Deno.test("generate composites branding logo onto PNG output", async () => {
  const originalFetch = globalThis.fetch;
  const outputDir = await Deno.makeTempDir({ prefix: "content-image-" });
  const { context, fileWrites } = makeContext(outputDir);

  // 64x64 solid red base returned by the API; 16x16 solid blue logo on disk.
  const basePng = solidPng(64, 64, [255, 0, 0, 255]);
  const logoPath = `${outputDir}/logo.png`;
  await Deno.writeFile(logoPath, solidPng(16, 16, [0, 0, 255, 255]));
  context.globalArgs.branding = {
    logo: logoPath,
    name: "test",
    link: "https://example.com",
  };

  globalThis.fetch = (() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [{ b64_json: toBase64(basePng) }],
        }),
    } as Response)) as typeof fetch;

  try {
    await model.methods.generate.execute(
      {
        prompt: "A test pattern",
        style: "none",
        model: "gpt-image-1.5",
        background: "opaque",
        size: "1024x1024",
        quality: "auto",
        format: "png",
        filename: "branded.png",
        outputDir,
      },
      context,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert(
    fileWrites.some((write) => write.kind === "imageFile:bytes"),
    "expected image file write",
  );
  const written = await Deno.readFile(`${outputDir}/branded.png`);
  const decoded = UPNG.decode(
    written.buffer.slice(
      written.byteOffset,
      written.byteOffset + written.byteLength,
    ) as ArrayBuffer,
  );
  assert(decoded.width === 64 && decoded.height === 64, "expected 64x64 output");
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
          prompt: "A test pattern",
          style: "none",
          model: "gpt-image-1.5",
          background: "opaque",
          size: "1024x1024",
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

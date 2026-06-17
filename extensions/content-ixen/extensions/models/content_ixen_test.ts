import { model } from "./content_ixen.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("save rotates previous Ixen output and renders version menu", async () => {
  const outputDir = await Deno.makeTempDir({ prefix: "content-ixen-" });
  const writes: string[] = [];
  const context = {
    globalArgs: { apiFormat: "openai-compat" as const },
    writeResource: () => Promise.resolve({}),
    createFileWriter: () => ({
      writeText: (text: string) => {
        writes.push(text);
        return Promise.resolve({});
      },
    }),
    logger: {
      info: () => {},
      error: () => {},
    },
  };

  const save = model.methods.save.execute;

  await save(
    {
      content:
        'First\n\n<p>first</p><figure class="zoom"><img src="./old.png" alt="old"></figure>',
      narrator: "smoke",
      topic: "Smoke",
      skillLevel: "intermediate",
      model: "external",
      outputDir,
      versionOutput: true,
    },
    context,
  );
  await Deno.writeFile(`${outputDir}/old.png`, new Uint8Array([1, 2, 3]));

  await save(
    {
      content: "Second\n\n<p>second</p>",
      narrator: "smoke",
      topic: "Smoke",
      skillLevel: "intermediate",
      model: "external",
      outputDir,
      versionOutput: true,
    },
    context,
  );

  const current = await Deno.readTextFile(`${outputDir}/index.html`);
  const previous = await Deno.readTextFile(`${outputDir}/1/index.html`);
  const oldImage = await Deno.stat(`${outputDir}/1/old.png`);

  assert(writes.length === 2, "expected both HTML writes to be recorded");
  assert(
    current.includes("Made with Swamp extension @alvagante/content-ixen"),
    "expected top provenance",
  );
  assert(current.includes("ixen-version-select"), "expected version selector");
  assert(previous.includes("first"), "expected previous page to rotate");
  assert(oldImage.size === 3, "expected referenced media to rotate");
});

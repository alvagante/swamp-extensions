import { model } from "./content_ixen.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("save rotates previous Ixen output and renders version menu", async () => {
  const outputDir = await Deno.makeTempDir({ prefix: "content-ixen-" });
  const writes: string[] = [];
  const resources: unknown[] = [];
  const context = {
    globalArgs: { apiFormat: "openai-compat" as const },
    writeResource: (_specName: string, _name: string, content: unknown) => {
      resources.push(content);
      return Promise.resolve({});
    },
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
      persona: "neutral",
      credits: "Custom credits",
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
      persona: "abnormalia",
      personaDescription: "Custom machine noir.",
      credits: "Custom credits",
      outputDir,
      versionOutput: true,
      headerContent: '<p class="shell-header">custom header</p>',
      footerContent: '<p class="shell-footer">custom footer</p>',
      cheatsheetPath: "cheatsheet.html",
    },
    context,
  );

  const current = await Deno.readTextFile(`${outputDir}/index.html`);
  const previous = await Deno.readTextFile(`${outputDir}/1/index.html`);
  const oldImage = await Deno.stat(`${outputDir}/1/old.png`);

  assert(writes.length === 2, "expected both HTML writes to be recorded");
  assert(resources.length === 2, "expected both page resources to be recorded");
  assert(
    (resources[1] as { persona?: string }).persona === "abnormalia",
    "expected persona metadata to be stored",
  );
  assert(
    (resources[1] as { personaDescription?: string }).personaDescription ===
      "Custom machine noir.",
    "expected persona description metadata to be stored",
  );
  assert(
    current.includes('<div class="credits">Made by Custom credits - 20'),
    "expected custom credits and timestamp in top-right provenance",
  );
  assert(
    !current.includes(
      '<div class="credits">Made with Swamp extension @alvagante/content-ixen',
    ),
    "expected custom credits to replace default top-right provenance",
  );
  assert(current.includes("custom header"), "expected custom header content");
  assert(current.includes("custom footer"), "expected custom footer content");
  assert(
    current.includes('<iframe src="./cheatsheet.html"'),
    "expected inline cheatsheet iframe",
  );
  assert(
    current.indexOf("custom header") < current.indexOf("<main>"),
    "expected custom header before main content",
  );
  assert(
    current.indexOf("custom footer") > current.indexOf("cheatsheet.html"),
    "expected custom footer after inline cheatsheet",
  );
  assert(current.includes("ixen-version-select"), "expected version selector");
  assert(previous.includes("first"), "expected previous page to rotate");
  assert(oldImage.size === 3, "expected referenced media to rotate");
});

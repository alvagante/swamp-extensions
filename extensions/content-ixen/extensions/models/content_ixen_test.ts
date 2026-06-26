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
      musicTracks: [
        { title: "Historical track", filename: "1/historical.mp3" },
        { title: "Current track", filename: "current.mp3" },
      ],
    },
    context,
  );
  await Deno.writeFile(`${outputDir}/old.png`, new Uint8Array([1, 2, 3]));
  await Deno.writeFile(`${outputDir}/current.mp3`, new Uint8Array([4, 5, 6]));

  await save(
    {
      content: `Second

<p>second</p>
<div class="concept-tools">
  <button class="cmd popup-trigger concept-btn" data-popup="kernel-slide">slide</button>
  <button class="cmd popup-trigger concept-btn" data-popup="kernel-notes">notes</button>
</div>
<aside class="popup concept-slide" id="kernel-slide" hidden>
  <div class="popup-bar"><button class="popup-close">Close Window</button></div>
  <h2>Kernel</h2>
  <ul><li>Schedules runnable work.</li></ul>
</aside>
<aside class="popup concept-note" id="kernel-notes" hidden>
  <div class="popup-bar"><button class="popup-close">Close Window</button></div>
  <h2>Kernel notes</h2>
  <p>The kernel arbitrates CPU time.</p>
</aside>
<figure class="zoom ixen-card-img small float-right"><img src="./kernel-card.png" alt="Kernel card"><figcaption>Kernel card</figcaption></figure>`,
      narrator: "smoke",
      topic: "Smoke",
      skillLevel: "intermediate",
      model: "external",
      persona: "abnormalia",
      personaDescription: "Custom machine noir.",
      style: "ixen-dark",
      credits: "Custom credits",
      outputDir,
      versionOutput: true,
      headerContent: '<p class="shell-header">custom header</p>',
      footerContent: '<p class="shell-footer">custom footer</p>',
      cheatsheetPath: "cheatsheet.html",
      infographicPath: "infographic.html",
      cards: [{ path: "kernel-card.png", title: "Kernel card" }],
    },
    context,
  );

  const current = await Deno.readTextFile(`${outputDir}/index.html`);
  const previous = await Deno.readTextFile(`${outputDir}/1/index.html`);
  const oldImage = await Deno.stat(`${outputDir}/1/old.png`);
  const currentTrack = await Deno.stat(`${outputDir}/1/current.mp3`);

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
    (resources[1] as { style?: string }).style === "ixen-dark",
    "expected style metadata to be stored",
  );
  assert(
    current.includes(
      '<a href="https://swamp-club.com/extensions/@alvagante/content-ixen" target="_blank" rel="noopener noreferrer">Generated with Swamp extension @alvagante/content-ixen</a>',
    ),
    "expected footer provenance extension link",
  );
  assert(
    current.includes(
      '<div class="ixen-provenance-meta"><span>abnormalia + custom voice</span><span>style: ixen-dark</span></div>',
    ),
    "expected persona and style provenance metadata",
  );
  assert(
    current.includes('<span class="ixen-title-meta">By Custom credits — 20'),
    "expected custom credits and timestamp in byline",
  );
  assert(
    current.includes('data-popup="ixen-all-slides">Slides</button>'),
    "expected Slides quick-nav button",
  );
  assert(
    current.includes('data-popup="ixen-all-notes">Notes</button>'),
    "expected Notes quick-nav button",
  );
  assert(
    current.includes('data-popup="ixen-card-deck">Card Deck</button>'),
    "expected Card Deck quick-nav button",
  );
  assert(
    current.includes('<aside class="popup" id="ixen-card-deck" hidden>'),
    "expected card deck popup",
  );
  assert(
    current.includes("function cardPreviewImage"),
    "expected delegated card hover preview handler",
  );
  assert(
    current.includes("figure.zoom.ixen-card-img"),
    "expected right-side card styling",
  );
  assert(
    current.includes(".ixen-card-hover"),
    "expected card hover preview styling",
  );
  assert(
    current.includes('buildConceptIndexPopup("concept-slide"'),
    "expected aggregate slide popup builder",
  );
  assert(current.includes("custom header"), "expected custom header content");
  assert(current.includes("custom footer"), "expected custom footer content");
  assert(
    current.includes('<iframe src="./cheatsheet.html"'),
    "expected inline cheatsheet iframe",
  );
  assert(
    current.includes('<iframe src="./infographic.html"'),
    "expected inline infographic iframe",
  );
  assert(
    current.indexOf("custom header") <
      current.indexOf('<header class="ixen-title-shell">'),
    "expected custom header before built-in Ixen title header",
  );
  assert(
    current.indexOf("infographic.html") < current.indexOf("cheatsheet.html"),
    "expected inline infographic before inline cheatsheet",
  );
  assert(
    current.indexOf("custom footer") > current.indexOf("cheatsheet.html"),
    "expected custom footer after inline embeds",
  );
  assert(current.includes("ixen-version-select"), "expected version selector");
  assert(previous.includes("first"), "expected previous page to rotate");
  assert(oldImage.size === 3, "expected referenced media to rotate");
  assert(currentTrack.size === 3, "expected root-local music to rotate");
  assert(
    previous.includes('"filename":"../1/historical.mp3"'),
    "expected historical track paths to be rebased after rotation",
  );
  assert(
    previous.includes('"filename":"current.mp3"'),
    "expected rotated local tracks to stay local",
  );
});

Deno.test("generate rejects truncated provider output before writing", async () => {
  const originalFetch = globalThis.fetch;
  let writeCount = 0;
  globalThis.fetch = (() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{
            message: {
              content: "Broken Ixen\n\n<section><ul><li>PV: modified guest",
            },
            finish_reason: "length",
          }],
        }),
    } as Response)) as typeof fetch;

  const context = {
    globalArgs: { apiFormat: "openai-compat" as const },
    writeResource: () => {
      writeCount++;
      return Promise.resolve({});
    },
    createFileWriter: () => ({
      writeText: () => {
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
    const generate = model.methods.generate.execute;
    let error: unknown;
    try {
      await generate(
        {
          topic: "Broken",
          skillLevel: "intermediate",
          outputLength: "medium",
          model: "local",
          persona: "neutral",
          versionOutput: false,
        },
        context,
      );
    } catch (caught) {
      error = caught;
    }

    assert(error instanceof Error, "expected generate to throw");
    assert(
      error.message.includes("truncated Ixen page output"),
      "expected truncated output error",
    );
    assert(writeCount === 0, "expected no writes after truncated output");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

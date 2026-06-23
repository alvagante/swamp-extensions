import { z } from "npm:zod@4";

const MusicModelSchema = z.enum(["suno-ttapi", "lyria-002"]);
const SunoVersionSchema = z.enum([
  "chirp-v3-0",
  "chirp-v3-5",
  "chirp-v4",
  "chirp-v4-5",
]);

type MusicModel = z.infer<typeof MusicModelSchema>;
type SunoVersion = z.infer<typeof SunoVersionSchema>;

const SongSchema = z.object({
  title: z.string(),
  topic: z.string(),
  lyrics: z.string().optional(),
  genre: z.string(),
  mood: z.string(),
  model: z.string(),
  sunoVersion: z.string().optional(),
  instrumental: z.boolean(),
  filename: z.string(),
  outputPath: z.string().optional(),
  audioUrl: z.string().optional(),
  generatedAt: z.string(),
});

const PlaylistTrackSchema = z.object({
  title: z.string(),
  filename: z.string(),
  lyrics: z.string().optional(),
});

const PlaylistSchema = z.object({
  title: z.string(),
  topic: z.string(),
  genre: z.string(),
  mood: z.string(),
  model: z.string(),
  sunoVersion: z.string().optional(),
  instrumental: z.boolean(),
  trackCount: z.number().int().nonnegative(),
  tracks: z.array(PlaylistTrackSchema).min(1),
  generatedAt: z.string(),
});

type Playlist = z.infer<typeof PlaylistSchema>;

type ModelContext = {
  globalArgs: {
    apiKey?: string;
    anthropicApiKey?: string;
    outputDir?: string;
  };
  writeResource: (
    specName: "song" | "playlist",
    name: string,
    content: unknown,
  ) => Promise<unknown>;
  createFileWriter: (
    specName: "audioFile",
    name: string,
    overrides?: { contentType?: string },
  ) => {
    writeAll: (bytes: Uint8Array) => Promise<unknown>;
  };
  logger: {
    info: (msg: string, props?: Record<string, unknown>) => void;
    error: (msg: string, props?: Record<string, unknown>) => void;
  };
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function buildFilename(
  title: string,
  model: MusicModel,
  index = 0,
  total = 1,
): string {
  const slug = slugify(title.split(" ").slice(0, 6).join(" "));
  const ts = Date.now().toString(36);
  const ext = model === "lyria-002" ? "wav" : "mp3";
  const suffix = total > 1 ? `-${index + 1}` : "";
  return `${slug}-${ts}${suffix}.${ext}`;
}

function buildTrackTitle(
  baseTitle: string,
  index: number,
  total: number,
): string {
  if (total <= 1 || index === 0) return baseTitle;
  return `${baseTitle} (Alt ${index + 1})`;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

async function generateLyrics(
  anthropicApiKey: string,
  topic: string,
  genre: string,
  mood: string,
  title?: string,
): Promise<{ title: string; lyrics: string; tags: string }> {
  const prompt =
    `You are a skilled songwriter. Write song lyrics where the subject of "${topic}" narrates itself in first person — the topic becomes the singer.
Genre: ${genre}
Mood: ${mood}
${title ? `Title: ${title}` : "Suggest a catchy title"}

Requirements:
- Structure: verse, chorus, verse, chorus, bridge, chorus
- Under 400 words, singable
- Educational yet engaging — the topic personified

Respond with ONLY a JSON object (no markdown fences):
{"title":"...","lyrics":"...","tags":"comma,separated,genre,mood,descriptors"}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": anthropicApiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${body}`);
  }

  const json = await response.json() as {
    content: Array<{ text: string }>;
  };
  const text = json.content[0]?.text ?? "";

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(
      `Failed to parse lyrics JSON from Anthropic response: ${
        text.slice(0, 200)
      }`,
    );
  }
  return JSON.parse(match[0]) as {
    title: string;
    lyrics: string;
    tags: string;
  };
}

type OneMinRecord = {
  uuid?: string;
  status?: string;
  temporaryUrl?: string;
  audioUrl?: string;
  aiRecordDetail?: {
    resultObject?: unknown[];
  };
  error?: string;
};

type OneMinResponse = {
  aiRecord?: OneMinRecord;
};

function extractTrackUrls(record: OneMinRecord | undefined): string[] {
  if (!record) return [];

  const urls: string[] = [];
  if (record.temporaryUrl) urls.push(record.temporaryUrl);
  if (record.audioUrl) urls.push(record.audioUrl);

  for (const item of record.aiRecordDetail?.resultObject ?? []) {
    if (typeof item === "string") {
      urls.push(item);
      continue;
    }
    if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>;
      if (typeof obj.temporaryUrl === "string") urls.push(obj.temporaryUrl);
      else if (typeof obj.audioUrl === "string") urls.push(obj.audioUrl);
    }
  }

  return [...new Set(urls.filter(isHttpUrl))];
}

async function pollFor1minResult(
  apiKey: string,
  uuid: string,
  maxWaitMs = 300_000,
): Promise<string[]> {
  const deadline = Date.now() + maxWaitMs;
  const interval = 5_000;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval));

    const res = await fetch(`https://api.1min.ai/api/features/${uuid}`, {
      headers: { "API-KEY": apiKey },
    });

    if (!res.ok) continue;

    const json = await res.json() as OneMinResponse;
    const record = json.aiRecord;

    if (record?.status === "FAILED") {
      throw new Error(
        `1min.ai song generation failed: ${record.error ?? "unknown error"}`,
      );
    }

    if (record?.status === "SUCCESS") {
      const urls = extractTrackUrls(record);
      if (urls.length > 0) return urls;
    }
  }

  throw new Error(
    `Timed out after ${maxWaitMs / 1000}s waiting for song generation`,
  );
}

async function callMusicApi(
  apiKey: string,
  params: {
    model: MusicModel;
    lyrics?: string;
    title?: string;
    tags?: string;
    instrumental: boolean;
    sunoVersion: SunoVersion;
    musicDescription?: string;
  },
  logger: ModelContext["logger"],
): Promise<string[]> {
  let body: Record<string, unknown>;

  if (params.model === "suno-ttapi") {
    body = {
      type: "MUSIC_GENERATOR",
      model: "suno-ttapi",
      promptObject: {
        mv: params.sunoVersion,
        custom: !params.instrumental && !!params.lyrics,
        prompt: params.lyrics ?? "",
        title: params.title ?? "",
        tags: params.tags ?? "",
        instrumental: params.instrumental,
      },
    };
  } else {
    body = {
      type: "MUSIC_GENERATOR",
      model: "lyria-002",
      conversationId: "MUSIC_GENERATOR",
      promptObject: {
        prompt: params.musicDescription ??
          `${params.tags ?? ""} ${params.title ?? ""}`.trim(),
      },
    };
  }

  const response = await fetch("https://api.1min.ai/api/features", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "API-KEY": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `1min.ai API error ${response.status}: ${errorBody}`,
    );
  }

  const json = await response.json() as OneMinResponse;
  const record = json.aiRecord;

  if (record?.status === "SUCCESS") {
    const urls = extractTrackUrls(record);
    if (urls.length > 0) return urls;
  }

  const uuid = record?.uuid;
  if (!uuid) {
    throw new Error(
      `1min.ai returned no audio URL and no UUID for polling. Response: ${
        JSON.stringify(json)
      }`,
    );
  }

  logger.info("Song generation queued, polling {uuid}", { uuid });
  return await pollFor1minResult(apiKey, uuid);
}

export const model = {
  type: "@alvagante/content-music",
  version: "2026.06.23.3",
  globalArguments: z.object({
    apiKey: z.string().optional().meta({ sensitive: true }),
    anthropicApiKey: z.string().optional().meta({ sensitive: true }),
    outputDir: z.string().optional(),
  }),
  resources: {
    song: {
      description:
        "Generated song metadata: title, lyrics, genre, model, filename, audioUrl",
      schema: SongSchema,
      lifetime: "infinite",
      garbageCollection: 20,
    },
    playlist: {
      description:
        "All track variants returned by a single music generation call, with titles and filenames.",
      schema: PlaylistSchema,
      lifetime: "infinite",
      garbageCollection: 20,
    },
  },
  files: {
    audioFile: {
      description: "Generated audio file (MP3 for Suno, WAV for Lyria)",
      contentType: "audio/mpeg",
      lifetime: "infinite",
      garbageCollection: 20,
    },
  },
  methods: {
    generate: {
      description:
        "Generate a song from a topic. Uses Claude to write lyrics (Suno with vocals), then 1min.ai to produce audio. Use model=lyria-002 for instrumental-only output.",
      arguments: z.object({
        topic: z.string().min(1),
        genre: z.string().default("pop"),
        mood: z.string().default("upbeat"),
        title: z.string().optional(),
        instrumental: z.boolean().default(false),
        model: MusicModelSchema.default("suno-ttapi"),
        sunoVersion: SunoVersionSchema.default("chirp-v4-5"),
        lyricsOnly: z.boolean().default(false),
        outputDir: z.string().optional(),
      }),
      execute: async (
        args: {
          topic: string;
          genre: string;
          mood: string;
          title?: string;
          instrumental: boolean;
          model: MusicModel;
          sunoVersion: SunoVersion;
          lyricsOnly: boolean;
          outputDir?: string;
        },
        context: ModelContext,
      ) => {
        const { apiKey, anthropicApiKey, outputDir: globalOutputDir } =
          context.globalArgs;
        const outputDir = args.outputDir ?? globalOutputDir;

        if (!apiKey && !args.lyricsOnly) {
          throw new Error(
            "apiKey (1min.ai) is required — set it as a global argument or via vault.get(onemin-keys, API_KEY)",
          );
        }

        let lyrics: string | undefined;
        let songTitle = args.title;
        let tags = `${args.genre},${args.mood}`;

        const needsLyrics = !args.instrumental && args.model === "suno-ttapi";

        if (needsLyrics) {
          if (!anthropicApiKey) {
            throw new Error(
              "anthropicApiKey is required for lyrics generation — set it as a global argument or via vault.get(anthropic-keys, API_KEY)",
            );
          }

          context.logger.info("Generating lyrics for {topic}", {
            topic: args.topic,
          });
          const result = await generateLyrics(
            anthropicApiKey,
            args.topic,
            args.genre,
            args.mood,
            songTitle,
          );
          lyrics = result.lyrics;
          songTitle = songTitle ?? result.title;
          tags = result.tags;
          context.logger.info("Lyrics ready: {title}", { title: songTitle });
        }

        if (args.lyricsOnly) {
          context.logger.info("lyricsOnly=true, skipping audio generation");
          const handle = await context.writeResource("song", "song", {
            title: songTitle ?? args.topic,
            topic: args.topic,
            lyrics,
            genre: args.genre,
            mood: args.mood,
            model: args.model,
            sunoVersion: args.model === "suno-ttapi"
              ? args.sunoVersion
              : undefined,
            instrumental: args.instrumental,
            filename: "",
            generatedAt: new Date().toISOString(),
          });
          return { dataHandles: [handle] };
        }

        context.logger.info("Generating music with {model}", {
          model: args.model,
        });

        const musicDescription = args.instrumental || args.model === "lyria-002"
          ? `${args.genre} ${args.mood} music about ${args.topic}`
          : undefined;

        const urls = await callMusicApi(
          apiKey!,
          {
            model: args.model,
            lyrics,
            title: songTitle,
            tags,
            instrumental: args.instrumental,
            sunoVersion: args.sunoVersion,
            musicDescription,
          },
          context.logger,
        );

        const audioUrl = urls[0];
        context.logger.info("Audio ready: {audioUrl}", { audioUrl });

        const filename = buildFilename(songTitle ?? args.topic, args.model);
        const contentType = args.model === "lyria-002"
          ? "audio/wav"
          : "audio/mpeg";

        const audioResponse = await fetch(audioUrl);
        if (!audioResponse.ok) {
          throw new Error(
            `Failed to download audio from 1min.ai (${audioResponse.status})`,
          );
        }
        const audioBytes = new Uint8Array(await audioResponse.arrayBuffer());

        const writer = context.createFileWriter("audioFile", "audioFile", {
          contentType,
        });
        const fileHandle = await writer.writeAll(audioBytes);

        let outputPath: string | undefined;
        if (outputDir) {
          await Deno.mkdir(outputDir, { recursive: true });
          outputPath = `${outputDir}/${filename}`;
          await Deno.writeFile(outputPath, audioBytes);
          context.logger.info("Audio written to {outputPath}", { outputPath });
        }

        const songHandle = await context.writeResource("song", "song", {
          title: songTitle ?? args.topic,
          topic: args.topic,
          lyrics,
          genre: args.genre,
          mood: args.mood,
          model: args.model,
          sunoVersion: args.model === "suno-ttapi"
            ? args.sunoVersion
            : undefined,
          instrumental: args.instrumental,
          filename,
          outputPath,
          audioUrl,
          generatedAt: new Date().toISOString(),
        });

        return { dataHandles: [songHandle, fileHandle] };
      },
    },

    generatePlaylist: {
      description:
        "Generate music and return all track variants produced by a single provider API call (Suno returns 2 variants). Writes a playlist resource with all tracks. Use model=lyria-002 for instrumental-only output.",
      arguments: z.object({
        topic: z.string().min(1),
        genre: z.string().default("pop"),
        mood: z.string().default("upbeat"),
        title: z.string().optional(),
        instrumental: z.boolean().default(false),
        model: MusicModelSchema.default("suno-ttapi"),
        sunoVersion: SunoVersionSchema.default("chirp-v4-5"),
        outputDir: z.string().optional(),
      }),
      execute: async (
        args: {
          topic: string;
          genre: string;
          mood: string;
          title?: string;
          instrumental: boolean;
          model: MusicModel;
          sunoVersion: SunoVersion;
          outputDir?: string;
        },
        context: ModelContext,
      ) => {
        const { apiKey, anthropicApiKey, outputDir: globalOutputDir } =
          context.globalArgs;
        const outputDir = args.outputDir ?? globalOutputDir;

        if (!apiKey) {
          throw new Error(
            "apiKey (1min.ai) is required — set it as a global argument or via vault.get(onemin-keys, API_KEY)",
          );
        }

        let lyrics: string | undefined;
        let songTitle = args.title;
        let tags = `${args.genre},${args.mood}`;

        const needsLyrics = !args.instrumental && args.model === "suno-ttapi";

        if (needsLyrics) {
          if (!anthropicApiKey) {
            throw new Error(
              "anthropicApiKey is required for lyrics generation — set it as a global argument or via vault.get(anthropic-keys, API_KEY)",
            );
          }

          context.logger.info("Generating lyrics for {topic}", {
            topic: args.topic,
          });
          const result = await generateLyrics(
            anthropicApiKey,
            args.topic,
            args.genre,
            args.mood,
            songTitle,
          );
          lyrics = result.lyrics;
          songTitle = songTitle ?? result.title;
          tags = result.tags;
          context.logger.info("Lyrics ready: {title}", { title: songTitle });
        }

        context.logger.info("Generating music with {model}", {
          model: args.model,
        });

        const musicDescription = args.instrumental || args.model === "lyria-002"
          ? `${args.genre} ${args.mood} music about ${args.topic}`
          : undefined;

        const urls = await callMusicApi(
          apiKey,
          {
            model: args.model,
            lyrics,
            title: songTitle,
            tags,
            instrumental: args.instrumental,
            sunoVersion: args.sunoVersion,
            musicDescription,
          },
          context.logger,
        );

        if (urls.length === 0) {
          throw new Error("Music provider returned no playable track URLs");
        }

        context.logger.info("Got {count} track(s) from provider", {
          count: urls.length,
        });

        if (outputDir) {
          await Deno.mkdir(outputDir, { recursive: true });
        }

        const contentType = args.model === "lyria-002"
          ? "audio/wav"
          : "audio/mpeg";
        const resolvedTitle = songTitle ?? args.topic;
        const dataHandles: unknown[] = [];
        const tracks: Array<
          { title: string; filename: string; lyrics?: string }
        > = [];

        for (const [index, url] of urls.entries()) {
          const audioResponse = await fetch(url);
          if (!audioResponse.ok) {
            throw new Error(
              `Failed to download audio track ${
                index + 1
              } (${audioResponse.status})`,
            );
          }
          const bytes = new Uint8Array(await audioResponse.arrayBuffer());
          const filename = buildFilename(
            resolvedTitle,
            args.model,
            index,
            urls.length,
          );

          const writer = context.createFileWriter(
            "audioFile",
            `audio-file-${index + 1}`,
            { contentType },
          );
          dataHandles.push(await writer.writeAll(bytes));

          if (outputDir) {
            await Deno.writeFile(`${outputDir}/${filename}`, bytes);
          }

          tracks.push({
            title: buildTrackTitle(resolvedTitle, index, urls.length),
            filename,
            lyrics,
          });
        }

        const playlist: Playlist = {
          title: resolvedTitle,
          topic: args.topic,
          genre: args.genre,
          mood: args.mood,
          model: args.model,
          sunoVersion: args.model === "suno-ttapi"
            ? args.sunoVersion
            : undefined,
          instrumental: args.instrumental,
          trackCount: tracks.length,
          tracks,
          generatedAt: new Date().toISOString(),
        };

        dataHandles.unshift(
          await context.writeResource("playlist", "playlist", playlist),
        );

        context.logger.info("Generated playlist with {trackCount} track(s)", {
          trackCount: tracks.length,
        });

        return { dataHandles };
      },
    },
  },
};

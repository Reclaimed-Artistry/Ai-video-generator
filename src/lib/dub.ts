import { getLanguage, LANGUAGES, type AspectRatio, type Project, type Scene } from "./types";

export type TranslationProvider = "openai" | "deepl" | "libretranslate" | "none";

export type DubProviderStatus = {
  provider: TranslationProvider;
  label: string;
  note: string;
  configured: boolean;
};

export function activeTranslationProvider(): TranslationProvider {
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.DEEPL_API_KEY) return "deepl";
  if (process.env.LIBRETRANSLATE_URL || process.env.LIBRETRANSLATE_API_KEY) {
    return "libretranslate";
  }
  return "none";
}

export function dubProviderStatus(): DubProviderStatus {
  const provider = activeTranslationProvider();
  const map: Record<TranslationProvider, Omit<DubProviderStatus, "provider" | "configured">> = {
    openai: {
      label: "OpenAI Translate",
      note: "Whole-script translation with tone preserved via gpt-4o-mini.",
    },
    deepl: {
      label: "DeepL",
      note: "High quality machine translation via the DeepL API.",
    },
    libretranslate: {
      label: "LibreTranslate",
      note: "Self-hostable open-source translation endpoint.",
    },
    none: {
      label: "No translation key",
      note: "Set OPENAI_API_KEY, DEEPL_API_KEY, or LIBRETRANSLATE_URL to translate scripts. Captions and voice locale still switch.",
    },
  };
  return {
    provider,
    configured: provider !== "none",
    ...map[provider],
  };
}

/** Trims a line so it still reads like natural spoken narration. */
function cleanLine(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > 0 ? text : fallback;
}

function parseTranslationArray(raw: string, expected: number, fallback: string[]): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return fallback.map((line, idx) =>
        cleanLine((parsed as unknown[])[idx], line),
      );
    }
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      const list = Array.isArray(record.translations)
        ? (record.translations as unknown[])
        : Array.isArray(record.lines)
          ? (record.lines as unknown[])
          : null;
      if (list) {
        return fallback.map((line, idx) => cleanLine(list[idx], line));
      }
    }
  } catch {
    // fall through
  }
  void expected;
  return fallback;
}

async function translateOpenAi(
  lines: string[],
  target: string,
  source: string,
): Promise<string[]> {
  const key = process.env.OPENAI_API_KEY as string;
  const targetLabel = getLanguage(target).label;
  const sourceLabel = getLanguage(source).label;
  const model = process.env.OPENAI_TRANSLATE_MODEL || "gpt-4o-mini";

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            `You are a professional video localisation engineer. Translate ${sourceLabel} ` +
            `voiceover narration into natural, spoken ${targetLabel}. Keep the same tone and ` +
            `energy, keep sentences short enough to read as subtitles, never add explanations, ` +
            `and preserve any brand or product names. Return strict JSON: ` +
            `{"translations": ["..."]} with exactly ${lines.length} items in the same order.`,
        },
        {
          role: "user",
          content: JSON.stringify({ lines }),
        },
      ],
    }),
  });
  if (!response.ok) throw new Error(`OpenAI translation failed (${response.status})`);
  const json = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = json.choices?.[0]?.message?.content ?? "";
  return parseTranslationArray(content, lines.length, lines);
}

async function translateDeepl(
  lines: string[],
  target: string,
  source: string,
): Promise<string[]> {
  const key = process.env.DEEPL_API_KEY as string;
  const base = (process.env.DEEPL_API_URL || "https://api-free.deepl.com").replace(/\/$/, "");
  const response = await fetch(`${base}/v2/translate`, {
    method: "POST",
    headers: {
      authorization: `DeepL-Auth-Key ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      text: lines,
      source_lang: source.toUpperCase(),
      target_lang: target === "zh" ? "ZH" : target.toUpperCase(),
    }),
  });
  if (!response.ok) throw new Error(`DeepL translation failed (${response.status})`);
  const json = (await response.json()) as { translations?: { text?: string }[] };
  const list = json.translations ?? [];
  return lines.map((line, idx) => cleanLine(list[idx]?.text, line));
}

async function translateLibre(
  lines: string[],
  target: string,
  source: string,
): Promise<string[]> {
  const base = (
    process.env.LIBRETRANSLATE_URL || "https://libretranslate.com"
  ).replace(/\/$/, "");
  const results = await Promise.all(
    lines.map(async (line) => {
      const response = await fetch(`${base}/translate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          q: line,
          source: source === "zh" ? "zh" : source,
          target: target === "zh" ? "zh" : target,
          format: "text",
          api_key: process.env.LIBRETRANSLATE_API_KEY || undefined,
        }),
      });
      if (!response.ok) return line;
      const json = (await response.json()) as { translatedText?: string };
      return cleanLine(json.translatedText, line);
    }),
  );
  return results;
}

export async function translateLines(
  lines: string[],
  target: string,
  source = "en",
): Promise<{ translations: string[]; provider: TranslationProvider; translated: boolean }> {
  if (target === source || lines.length === 0) {
    return { translations: lines, provider: "none", translated: false };
  }
  const provider = activeTranslationProvider();
  if (provider === "none") {
    return { translations: lines, provider, translated: false };
  }
  try {
    const translations =
      provider === "openai"
        ? await translateOpenAi(lines, target, source)
        : provider === "deepl"
          ? await translateDeepl(lines, target, source)
          : await translateLibre(lines, target, source);
    const changed = translations.some((line, idx) => line !== lines[idx]);
    return { translations, provider, translated: changed };
  } catch (error) {
    console.warn(
      "[dub] translation failed, keeping original narration:",
      error instanceof Error ? error.message : error,
    );
    return { translations: lines, provider, translated: false };
  }
}

/* ------------------------------------------------------------------ dubbing */

export type DubResult = {
  script: Project["script"];
  language: string;
  voice: string;
  changes: string[];
  translated: boolean;
  provider: TranslationProvider;
};

/**
 * Re-voices a project into another language: translates every narration line,
 * swaps the narrator to a native-locale neural voice, and rewrites scene
 * captions to match.
 */
export async function dubProject(
  project: Project,
  targetLanguage: string,
  options: { voiceGender?: "male" | "female" } = {},
): Promise<DubResult> {
  const target = getLanguage(targetLanguage);
  const scenes: Scene[] = (project.script?.scenes ?? []).map((scene) => ({ ...scene }));
  if (scenes.length === 0) {
    throw new Error("This project has no scenes to dub");
  }

  const narrations = scenes.map((scene) => scene.narration ?? "");
  const { translations, provider, translated } = await translateLines(
    narrations,
    target.id,
    project.language || "en",
  );

  const nextScenes = scenes.map((scene, idx) => ({
    ...scene,
    narration: translations[idx] ?? scene.narration,
    caption: scene.caption
      ? (translated ? (translations[idx] ?? scene.caption) : scene.caption)
      : scene.caption,
  }));

  // Pick a native narrator unless the user pinned a cloned voice.
  const isCloned = (project.voice ?? "").startsWith("clone:");
  const gender = options.voiceGender ?? "female";
  const nativeVoice = gender === "male" ? target.neuralMale : target.neuralFemale;

  const changes: string[] = [`Language → ${target.label} (${target.native})`];
  if (translated) {
    changes.push(`Translated ${nextScenes.length} narration lines via ${provider}`);
  } else {
    changes.push(
      provider === "none"
        ? "No translation provider configured — captions and voice locale switched only"
        : "Translation made no changes to the narration",
    );
  }

  return {
    script: {
      ...project.script,
      scenes: nextScenes,
      options: { ...(project.script.options ?? {}) },
    },
    language: target.id,
    voice: isCloned ? project.voice : `locale:${target.id}:${gender}:${nativeVoice}`,
    changes,
    translated,
    provider,
  };
}

/** Human-readable label for a `locale:<lang>:<gender>:<neural>` voice id. */
export function describeLocaleVoice(voiceId: string): string | null {
  if (!voiceId.startsWith("locale:")) return null;
  const [, lang, gender] = voiceId.split(":");
  const meta = LANGUAGES.find((item) => item.id === lang);
  if (!meta) return null;
  return `${meta.label} · ${gender === "male" ? "Male" : "Female"}`;
}

export const DUB_TARGETS = LANGUAGES;

export function frameLabel(aspect: AspectRatio): string {
  return aspect === "9:16" ? "Vertical 9:16" : aspect === "1:1" ? "Square 1:1" : "Landscape 16:9";
}

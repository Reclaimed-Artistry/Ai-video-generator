import { llmJson } from "./llm";
import { scriptWritingRules, sceneFromText } from "./script";
import {
  LANGUAGES,
  MAX_SCENES,
  resolveSettings,
  STYLES,
  TONES,
  type AspectRatio,
  type MusicChoice,
  type Project,
  type Resolution,
  type Scene,
  type Style,
  type Tone,
  type TransitionChoice,
  type VideoScript,
  type VideoSettings,
} from "./types";
import { VOICES } from "./voices";

export type ProjectPatch = Partial<{
  voice: string;
  resolution: Resolution;
  aspect: AspectRatio;
  tone: Tone;
  style: Style;
  language: string;
  title: string;
}>;

export type CommandResult = {
  patch: ProjectPatch;
  script: VideoScript;
  applied: string[];
  scriptChanged: boolean;
  usedAi: boolean;
};

const MUSIC_WORDS: [RegExp, MusicChoice][] = [
  [/\b(energetic|upbeat|electronic|dance|hype)\b/, "energetic"],
  [/\b(chill|relaxed|happy|friendly|warm)\b/, "friendly"],
  [/\b(corporate|professional|ambient|neutral|business)\b/, "professional"],
  [/\b(cinematic|epic|orchestral|dramatic|classical)\b/, "cinematic"],
  [/\b(calm|lo-?fi|minimal|soft|piano|quiet)\b/, "minimal"],
];

const SCRIPT_INTENT =
  /\b(shorter|longer|rewrite|re-?write|scene|script|narration|hook|intro|opening|ending|outro|cta|call to action|funn|serious|simpler|simple|casual|formal|translate|mention|include|add|remove|delete|replace|punch|story|tip|example|explain|more|less|tone|catchy|persuasive|emotional)\b/;

function pickVoice(command: string): string | null {
  const byName = VOICES.find((voice) => new RegExp(`\\b${voice.name.toLowerCase()}\\b`).test(command));
  if (byName) return byName.id;
  if (!/\b(voice|narrator|speaker|accent|male|female|man|woman|guy|girl|british|australian|american)\b/.test(command)) {
    return null;
  }
  const accent = /\b(british|uk|english accent|england)\b/.test(command)
    ? "British"
    : /\b(australian|aussie)\b/.test(command)
      ? "Australian"
      : /\b(american|us)\b/.test(command)
        ? "American"
        : null;
  const gender = /\b(male|man|guy|deep|masculine)\b/.test(command) && !/\bfemale\b/.test(command)
    ? "male"
    : /\b(female|woman|girl|feminine)\b/.test(command)
      ? "female"
      : null;
  if (!accent && !gender) return null;
  const match = VOICES.find(
    (voice) => (!accent || voice.accent === accent) && (!gender || voice.gender === gender),
  );
  return match?.id ?? null;
}

/** Instant, deterministic edits for production settings. */
function applyRules(command: string, project: Project) {
  const c = command.toLowerCase();
  const patch: ProjectPatch = {};
  const settings: VideoSettings = { ...resolveSettings(project.script.settings) };
  const applied: string[] = [];

  const res = /\b(1080|full ?hd|hd)\b/.test(c) ? "1080p" : /\b360\s?p?\b/.test(c) ? "360p" : /\b240\s?p?\b/.test(c) ? "240p" : null;
  if (res && res !== project.resolution) {
    patch.resolution = res;
    applied.push(`Resolution set to ${res}`);
  }

  const aspect: AspectRatio | null = /\b(vertical|portrait|9:16|tiktok|reels?|shorts|story)\b/.test(c)
    ? "9:16"
    : /\b(square|1:1)\b/.test(c)
      ? "1:1"
      : /\b(landscape|horizontal|16:9|widescreen|youtube)\b/.test(c)
        ? "16:9"
        : null;
  if (aspect && aspect !== project.aspect) {
    patch.aspect = aspect;
    applied.push(`Format changed to ${aspect}`);
  }

  const voice = pickVoice(c);
  if (voice && voice !== project.voice) {
    patch.voice = voice;
    const v = VOICES.find((item) => item.id === voice);
    applied.push(`Narrator changed to ${v?.name} (${v?.accent} ${v?.gender})`);
  }

  if (/\b(no|remove|without|mute|turn off|disable|stop)\b[\w\s]{0,12}\bmusic\b/.test(c)) {
    settings.music = "none";
    applied.push("Background music removed");
  } else if (/\bmusic\b/.test(c)) {
    const mood = MUSIC_WORDS.find(([pattern]) => pattern.test(c))?.[1];
    if (mood) {
      settings.music = mood;
      applied.push(`Music changed to ${mood}`);
    } else if (/\b(add|with|put|use)\b/.test(c) && settings.music === "none") {
      settings.music = "auto";
      applied.push("Background music added");
    }
    if (/\b(louder|increase|raise|more|up)\b/.test(c)) {
      settings.musicVolume = Math.min(1, (settings.musicVolume ?? 0.3) + 0.15);
      applied.push("Music made louder");
    } else if (/\b(quieter|softer|lower|decrease|less|down)\b/.test(c)) {
      settings.musicVolume = Math.max(0.05, (settings.musicVolume ?? 0.3) - 0.12);
      applied.push("Music made quieter");
    }
  }

  if (/\b(no|remove|hide|turn off|disable|without)\b[\w\s]{0,10}\b(subtitles?|captions?)\b/.test(c)) {
    settings.subtitles = false;
    applied.push("Subtitles turned off");
  } else if (/\b(add|show|turn on|enable|with)\b[\w\s]{0,10}\b(subtitles?|captions?)\b/.test(c)) {
    settings.subtitles = true;
    applied.push("Subtitles turned on");
  }
  if (/\b(no|remove|hide|without)\b[\w\s]{0,10}\b(titles?|headlines?|headers?)\b/.test(c)) {
    settings.headlines = false;
    applied.push("Scene titles hidden");
  }

  const transition: TransitionChoice | null = /\b(no transitions?|hard cuts?|remove transitions?|without transitions?)\b/.test(c)
    ? "none"
    : /\bslide\b/.test(c)
      ? "slide"
      : /\b(crossfade|cross-fade|fade|smooth transitions?|dissolve)\b/.test(c)
        ? "fade"
        : null;
  if (transition) {
    settings.transition = transition;
    applied.push(transition === "none" ? "Transitions removed" : `Transitions set to ${transition}`);
  }

  const styleMatch = STYLES.find((style) => new RegExp(`\\b${style}\\b[\\w\\s]{0,10}\\b(captions?|subtitles?|style)\\b`).test(c));
  if (styleMatch && styleMatch !== project.style) {
    patch.style = styleMatch;
    applied.push(`Caption style set to ${styleMatch}`);
  }

  const language = LANGUAGES.find((lang) => lang.id !== project.language && new RegExp(`\\b(in|to|into)\\s+${lang.label.toLowerCase()}\\b`).test(c));
  if (language) {
    patch.language = language.id;
    applied.push(`Language set to ${language.label}`);
  }

  const toneMatch = TONES.find((tone) => new RegExp(`\\b(more|make it|sound)\\b[\\w\\s]{0,8}\\b${tone}\\b`).test(c));
  if (toneMatch && toneMatch !== project.tone) {
    patch.tone = toneMatch;
    applied.push(`Tone set to ${toneMatch}`);
  }

  return { patch, settings, applied };
}

/** Rule-based script edits used when no AI provider is reachable. */
function fallbackScriptEdit(command: string, script: VideoScript): { scenes: Scene[]; note: string } | null {
  const c = command.toLowerCase();
  const remove = /\b(remove|delete|drop|cut)\b\s+(?:scene|cue)\s*(\d+)/.exec(c);
  if (remove) {
    const index = Number(remove[2]) - 1;
    if (index >= 0 && index < script.scenes.length && script.scenes.length > 1) {
      return { scenes: script.scenes.filter((_, i) => i !== index), note: `Removed scene ${index + 1}` };
    }
  }
  if (/\bshorter\b/.test(c)) {
    const keep = Math.max(2, Math.ceil(script.scenes.length * 0.7));
    const scenes = script.scenes
      .filter((_, index) => index === 0 || index === script.scenes.length - 1 || index < keep - 1)
      .map((scene) => {
        const sentences = scene.narration.match(/[^.!?]+[.!?]*/g) ?? [scene.narration];
        return { ...scene, narration: sentences[0].trim() };
      });
    return { scenes, note: "Shortened the script" };
  }
  return null;
}

type AiEdit = {
  reply?: string;
  title?: string;
  scenes?: { narration?: string; caption?: string; mediaQuery?: string }[];
};

export async function applyCommand(project: Project, command: string): Promise<CommandResult> {
  const { patch, settings, applied } = applyRules(command, project);
  let script: VideoScript = { ...project.script, settings };
  let scriptChanged = false;
  let usedAi = false;

  const needsScript =
    SCRIPT_INTENT.test(command.toLowerCase()) || Boolean(patch.language) || Boolean(patch.tone);
  const onlySettingsMatched = applied.length > 0 && !needsScript;

  if (!onlySettingsMatched && (needsScript || applied.length === 0)) {
    const language = patch.language ?? project.language;
    const tone = patch.tone ?? project.tone;
    const current = project.script.scenes.map((scene, index) => ({
      n: index + 1,
      narration: scene.narration,
      caption: scene.caption,
      mediaQuery: scene.mediaQuery,
    }));
    const ai = await llmJson<AiEdit>(
      [
        {
          role: "system",
          content: "You edit short-form video scripts precisely following the user's instruction. Reply with one JSON object only.",
        },
        {
          role: "user",
          content: `Video topic: "${project.prompt}".\nCurrent script (JSON): ${JSON.stringify({ title: project.script.title, scenes: current })}\n\nInstruction: "${command}"\n\nReturn the COMPLETE updated script. Keep scenes that the instruction does not affect unchanged (same narration, caption and mediaQuery). Max ${MAX_SCENES} scenes. ${scriptWritingRules({ tone, language, duration: project.duration })}\nJSON: {"reply": "one short sentence describing what you changed", "title": string, "scenes": [{"narration": string, "caption": string, "mediaQuery": string}]}`,
        },
      ],
      { timeoutMs: 50_000, temperature: 0.6 },
    );

    const aiScenes = (ai?.scenes ?? []).filter((scene) => scene?.narration?.trim());
    if (ai && aiScenes.length) {
      usedAi = true;
      const used: string[] = [];
      const scenes = aiScenes.slice(0, MAX_SCENES).map((scene, index) => {
        const existing = project.script.scenes[index];
        if (
          existing &&
          existing.narration.trim() === scene.narration?.trim() &&
          (scene.mediaQuery ?? existing.mediaQuery) === existing.mediaQuery
        ) {
          if (existing.mediaId) used.push(existing.mediaId);
          return { ...existing, caption: scene.caption ?? existing.caption };
        }
        // Keep the current footage when only the words changed.
        if (existing && (!scene.mediaQuery || scene.mediaQuery === existing.mediaQuery)) {
          if (existing.mediaId) used.push(existing.mediaId);
          return {
            ...existing,
            narration: scene.narration!.trim(),
            caption: (scene.caption ?? existing.caption).slice(0, 60),
          };
        }
        return sceneFromText(scene, existing?.mediaQuery ?? project.prompt, used, existing?.id);
      });
      script = { ...script, title: ai.title?.trim() || script.title, scenes };
      scriptChanged = true;
      applied.push(ai.reply?.trim() || "Script updated");
      if (ai.title?.trim()) patch.title = ai.title.trim().slice(0, 90);
    } else {
      const fallback = fallbackScriptEdit(command, project.script);
      if (fallback) {
        script = { ...script, scenes: fallback.scenes };
        scriptChanged = true;
        applied.push(fallback.note);
      }
    }
  }

  return { patch, script, applied, scriptChanged, usedAi };
}

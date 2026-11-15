import { randomUUID } from "node:crypto";
import { getMusicTrack, MUSIC_TRACKS } from "./music";
import { extractVisualKeywords, generateScript, regenerateScene } from "./script";
import {
  hydrateSceneMedia,
  matchBestStockVideo,
  matchVideoForNarration,
  previewUrlForAsset,
} from "./stock";
import {
  getPeopleRepresentation,
  LANGUAGES,
  MAX_SCENES,
  type AspectRatio,
  type CaptionMode,
  type MusicTrackId,
  type PeopleRepresentation,
  type Project,
  type Resolution,
  type Scene,
  type Style,
  type Tone,
} from "./types";
import { VOICES } from "./voices";

export type CommandResult = {
  patch: Partial<{
    title: string;
    voice: string;
    resolution: Resolution;
    aspect: AspectRatio;
    tone: Tone;
    style: Style;
    language: string;
    duration: number;
    script: Project["script"];
  }>;
  changes: string[];
  handled: boolean;
};

function findSceneIndex(text: string, total: number): number | null {
  const numMatch = /\b(?:scene|cue|clip|shot)\s*#?(\d+)\b/i.exec(text);
  if (numMatch) {
    const idx = Number(numMatch[1]) - 1;
    if (idx >= 0 && idx < total) return idx;
  }
  if (/\b(first|opening|intro)\s+(?:scene|cue|clip|shot)\b/i.test(text)) return 0;
  if (/\b(last|final|closing|outro)\s+(?:scene|cue|clip|shot)\b/i.test(text)) {
    return Math.max(0, total - 1);
  }
  if (/\bsecond\s+(?:scene|cue|clip|shot)\b/i.test(text) && total >= 2) return 1;
  if (/\bthird\s+(?:scene|cue|clip|shot)\b/i.test(text) && total >= 3) return 2;
  return null;
}

function matchVoiceFromCommand(lower: string): (typeof VOICES)[number] | null {
  // Exact persona name match first
  for (const voice of VOICES) {
    const pattern = new RegExp(`\\b${voice.name.toLowerCase()}\\b`, "i");
    if (pattern.test(lower)) return voice;
  }

  const mentionsVoice = /\b(voice|narrator|speaker|accent|male|female|man|woman|british|australian|american)\b/i.test(
    lower,
  );
  if (!mentionsVoice) return null;

  const wantFemale = /\b(female|woman|girl|she|her)\b/i.test(lower);
  const wantMale = /\b(male|man|guy|he|him|deep)\b/i.test(lower);
  const wantBritish = /\b(british|uk|english|london)\b/i.test(lower);
  const wantAus = /\b(australian|aussie|aus)\b/i.test(lower);
  const wantUs = /\b(american|us|usa)\b/i.test(lower);

  const candidates = VOICES.filter((v) => {
    if (wantFemale && v.gender !== "female") return false;
    if (wantMale && v.gender !== "male") return false;
    if (wantBritish && v.accent !== "British") return false;
    if (wantAus && v.accent !== "Australian") return false;
    if (wantUs && v.accent !== "American") return false;
    return true;
  });

  if (candidates.length > 0 && (wantFemale || wantMale || wantBritish || wantAus || wantUs)) {
    return candidates[0];
  }
  return null;
}

export async function interpretEditCommand(
  project: Project,
  rawCommand: string,
): Promise<CommandResult> {
  const command = rawCommand.trim();
  const lower = command.toLowerCase();
  const changes: string[] = [];

  const nextScript: Project["script"] = {
    ...project.script,
    scenes: project.script.scenes.map((scene) => ({ ...scene })),
    options: {
      ...project.script.options,
      workflow: project.script.options?.workflow ?? "explainer",
      musicTrack: project.script.options?.musicTrack ?? "cinematic",
      musicVolume: project.script.options?.musicVolume ?? 0.16,
      captionMode: project.script.options?.captionMode ?? "word-highlight",
      peopleRepresentation: project.script.options?.peopleRepresentation ?? "all",
    },
  };
  let scriptDirty = false;
  const patch: CommandResult["patch"] = {};

  // 0. People / Race Representation command: e.g. "use african american people", "african only", "hispanic cast", "all races"
  let requestedPeople: PeopleRepresentation | null = null;
  if (/\b(african[\s-]american|black\s+american)\b/i.test(lower)) {
    requestedPeople = "african-american";
  } else if (/\b(african\s+only|only\s+african|african\s+(?:people|cast|actors|models|talent))\b/i.test(lower)) {
    requestedPeople = "african";
  } else if (/\b(hispanic|latino|latina|latinx)\b/i.test(lower)) {
    requestedPeople = "hispanic";
  } else if (/\b(east[\s-]asian|chinese|japanese|korean)\b/i.test(lower)) {
    requestedPeople = "east-asian";
  } else if (/\b(south[\s-]asian|indian)\b/i.test(lower)) {
    requestedPeople = "south-asian";
  } else if (/\b(middle[\s-]eastern|arab|arabian)\b/i.test(lower)) {
    requestedPeople = "middle-eastern";
  } else if (/\b(caucasian|white\s+(?:people|cast|actors|models|talent)|european\s+(?:people|cast))\b/i.test(lower)) {
    requestedPeople = "caucasian";
  } else if (/\b(all\s+races|diverse\s+(?:people|cast|races)|multiracial)\b/i.test(lower)) {
    requestedPeople = "all";
  }

  if (requestedPeople) {
    nextScript.options!.peopleRepresentation = requestedPeople;
    const usedIds: string[] = [];
    const usedDemos: PeopleRepresentation[] = [];
    for (let i = 0; i < nextScript.scenes.length; i += 1) {
      const sc = nextScript.scenes[i];
      if (sc.mediaLocked && sc.mediaId) {
        usedIds.push(sc.mediaId);
        continue;
      }
      const { asset, mediaQuery } = await matchVideoForNarration({
        narration: sc.narration || sc.caption || project.prompt,
        caption: sc.caption,
        topicContext: project.prompt,
        excludeIds: usedIds,
        peopleRepresentation: requestedPeople,
        usedDemographics: usedDemos,
      });
      if (asset) {
        usedIds.push(asset.id);
        if (asset.demographics?.length) usedDemos.push(...asset.demographics);
        nextScript.scenes[i] = hydrateSceneMedia(
          {
            ...sc,
            mediaQuery,
            mediaId: asset.id,
            mediaType: "video",
            mediaUrl: previewUrlForAsset(asset),
            mediaThumb: asset.thumb,
            mediaTitle: asset.title,
            mediaCreator: asset.creator,
            mediaProvider: asset.provider,
          },
          requestedPeople,
        );
      }
    }
    scriptDirty = true;
    changes.push(
      `Cast → ${getPeopleRepresentation(requestedPeople).label} (synced all unlocked clips to narration)`,
    );
  }

  const activePeople: PeopleRepresentation =
    nextScript.options?.peopleRepresentation ?? "all";

  // 1. Resolution (240p / 360p / 1080p)
  if (/\b240p?\b/.test(lower)) {
    patch.resolution = "240p";
    changes.push("Resolution → 240p Proxy");
  } else if (/\b360p?\b/.test(lower)) {
    patch.resolution = "360p";
    changes.push("Resolution → 360p Web");
  } else if (/\b(1080p?|full\s*hd|hd\s*master)\b/.test(lower)) {
    patch.resolution = "1080p";
    changes.push("Resolution → 1080p Full HD");
  }

  // 2. Aspect Ratio
  if (/\b(9:16|vertical|portrait|shorts|reels|tiktok)\b/.test(lower)) {
    patch.aspect = "9:16";
    changes.push("Format → 9:16 Vertical");
  } else if (/\b(1:1|square)\b/.test(lower)) {
    patch.aspect = "1:1";
    changes.push("Format → 1:1 Square");
  } else if (/\b(16:9|landscape|widescreen|horizontal|youtube)\b/.test(lower) && !/\bshorts\b/.test(lower)) {
    patch.aspect = "16:9";
    changes.push("Format → 16:9 Landscape");
  }

  // 3. Voice / Narrator
  const matchedVoice = matchVoiceFromCommand(lower);
  if (matchedVoice) {
    patch.voice = matchedVoice.id;
    changes.push(`Voice → ${matchedVoice.name} (${matchedVoice.accent} ${matchedVoice.gender})`);
  }

  // 4. Language
  for (const lang of LANGUAGES) {
    const pattern = new RegExp(`\\b${lang.label.toLowerCase()}\\b`, "i");
    if (pattern.test(lower) && /\b(language|translate|speak|in\s+|to\s+|voice)\b/i.test(lower)) {
      patch.language = lang.id;
      changes.push(`Language → ${lang.label}`);
      break;
    }
  }

  // 5. Background Music
  if (/\b(no\s+music|remove\s+(?:the\s+)?music|mute\s+music|disable\s+music|turn\s+off\s+music|without\s+music)\b/i.test(lower)) {
    nextScript.options!.musicTrack = "none";
    scriptDirty = true;
    changes.push("Music → Off");
  } else if (/\bmusic|score|soundtrack|track|beat\b/i.test(lower)) {
    let chosen: MusicTrackId | null = null;
    if (/\b(upbeat|uplifting|energetic|fast|driving|electronic)\b/i.test(lower)) chosen = "uplifting";
    else if (/\b(cinematic|dramatic|epic|trailer|intense)\b/i.test(lower)) chosen = "cinematic";
    else if (/\b(ambient|calm|minimal|chill|dreamy|soft|lofi|lo-fi)\b/i.test(lower)) chosen = "ambient";
    else if (/\b(warm|friendly|happy|acoustic|piano)\b/i.test(lower)) chosen = "warm";
    else if (/\b(corporate|tech|modern|business|urban)\b/i.test(lower)) chosen = "corporate";
    else {
      for (const t of MUSIC_TRACKS) {
        if (lower.includes(t.name.toLowerCase())) {
          chosen = t.id;
          break;
        }
      }
    }
    if (chosen) {
      nextScript.options!.musicTrack = chosen;
      scriptDirty = true;
      changes.push(`Music → ${getMusicTrack(chosen).name}`);
    }
    if (/\b(louder|higher|boost|increase)\b/i.test(lower)) {
      nextScript.options!.musicVolume = Math.min(0.4, (nextScript.options!.musicVolume ?? 0.16) + 0.08);
      scriptDirty = true;
      changes.push(`Music volume → ${Math.round(nextScript.options!.musicVolume * 100)}%`);
    } else if (/\b(quieter|softer|lower|subtle|decrease)\b/i.test(lower)) {
      nextScript.options!.musicVolume = Math.max(0.06, (nextScript.options!.musicVolume ?? 0.16) - 0.06);
      scriptDirty = true;
      changes.push(`Music volume → ${Math.round(nextScript.options!.musicVolume * 100)}%`);
    }
  }

  // 6. Captions / Subtitles mode & style
  if (/\b(no\s+captions?|no\s+subtitles?|remove\s+captions?|remove\s+subtitles?|turn\s+off\s+(?:captions?|subtitles?)|hide\s+(?:captions?|subtitles?))\b/i.test(lower)) {
    nextScript.options!.captionMode = "off";
    scriptDirty = true;
    changes.push("Subtitles → Off");
  } else if (/\b(karaoke|word[\s-]highlight|word\s+by\s+word|dynamic\s+captions?|invideo\s+captions?)\b/i.test(lower)) {
    nextScript.options!.captionMode = "word-highlight";
    scriptDirty = true;
    changes.push("Subtitles → Synced Word Highlight");
  } else if (/\b(clean\s+subtitles?|normal\s+subtitles?|standard\s+subtitles?)\b/i.test(lower)) {
    nextScript.options!.captionMode = "subtitle";
    scriptDirty = true;
    changes.push("Subtitles → Clean Broadcast Lines");
  } else if (/\b(headline|lower[\s-]third)\b/i.test(lower)) {
    nextScript.options!.captionMode = "headline";
    scriptDirty = true;
    changes.push("Subtitles → Scene Headline Lower-Third");
  }

  if (/\b(yellow|bold|pop)\b/i.test(lower) && /\b(caption|subtitle|text)\b/i.test(lower)) {
    patch.style = "energetic";
    changes.push("Caption style → Energetic (Amber/Yellow)");
  } else if (/\bminimal\b/i.test(lower) && /\b(caption|subtitle|style)\b/i.test(lower)) {
    patch.style = "minimal";
    changes.push("Caption style → Minimal");
  } else if (/\bcorporate\b/i.test(lower) && /\b(caption|subtitle|style)\b/i.test(lower)) {
    patch.style = "corporate";
    changes.push("Caption style → Corporate");
  } else if (/\bcinematic\b/i.test(lower) && /\b(caption|subtitle|style)\b/i.test(lower)) {
    patch.style = "cinematic";
    changes.push("Caption style → Cinematic");
  }

  // 7. Scene-level media swap: "change scene 2 footage to ocean waves" / "replace scene 1 with coffee"
  const sceneIdx = findSceneIndex(command, nextScript.scenes.length);
  const mediaSwapMatch =
    /\b(?:change|replace|swap|set|use)\s+(?:(?:the\s+)?(?:first|second|third|last|final|opening|closing)\s+(?:scene|cue|clip|shot)|(?:scene|cue|clip|shot)\s*#?\d+)(?:'s)?\s*(?:media|video|clip|footage|b-?roll|visuals?)?\s+(?:to|with|for)\s+(.+)$/i.exec(
      command,
    );

  if (sceneIdx !== null && mediaSwapMatch && !/\b(narration|script|text|caption|say)\b/i.test(command)) {
    const desiredQuery = mediaSwapMatch[1]
      .replace(/\bfrom\s+(pexels|mixkit|wikimedia|nasa|pixabay)\b/i, "")
      .replace(/[.!?]+$/, "")
      .trim();
    const providerMatch = /\bfrom\s+(pexels|mixkit|wikimedia|nasa|pixabay)\b/i.exec(command);
    const preferredProvider = providerMatch?.[1]?.toLowerCase();

    if (desiredQuery) {
      const exclude = nextScript.scenes
        .filter((_, idx) => idx !== sceneIdx)
        .map((s) => s.mediaId)
        .filter((id): id is string => Boolean(id));
      const matched = await matchBestStockVideo(
        desiredQuery,
        exclude,
        preferredProvider,
        project.prompt,
        activePeople,
      );
      if (matched) {
        nextScript.scenes[sceneIdx] = hydrateSceneMedia(
          {
            ...nextScript.scenes[sceneIdx],
            mediaQuery: desiredQuery,
            mediaId: matched.id,
            mediaType: "video",
            mediaUrl: previewUrlForAsset(matched),
            mediaThumb: matched.thumb,
            mediaTitle: matched.title,
            mediaCreator: matched.creator,
            mediaProvider: matched.provider,
          },
          activePeople,
        );
        scriptDirty = true;
        changes.push(
          `Scene ${sceneIdx + 1} B-roll → "${matched.title}" (${matched.provider})`,
        );
      }
    }
  }

  // 8. Delete scene: "delete scene 3" / "remove last scene"
  if (
    sceneIdx !== null &&
    /\b(delete|remove|drop|cut)\b/i.test(lower) &&
    !/\b(music|caption|subtitle)\b/i.test(lower) &&
    nextScript.scenes.length > 1
  ) {
    nextScript.scenes.splice(sceneIdx, 1);
    scriptDirty = true;
    changes.push(`Removed Scene ${sceneIdx + 1}`);
  }

  // 9. Rewrite single scene: "rewrite scene 2"
  if (
    sceneIdx !== null &&
    /\b(rewrite|regenerate|redo|improve)\b/i.test(lower) &&
    nextScript.scenes[sceneIdx]
  ) {
    const rewritten = await regenerateScene(nextScript, sceneIdx, {
      prompt: project.prompt,
      tone: patch.tone ?? project.tone,
      peopleRepresentation: activePeople,
    });
    nextScript.scenes[sceneIdx] = { ...rewritten, id: nextScript.scenes[sceneIdx].id };
    scriptDirty = true;
    changes.push(`Rewrote Scene ${sceneIdx + 1}`);
  }

  // 10. Direct narration edit: "change scene 1 narration to ..." / "make scene 2 say ..."
  const narrationEdit =
    /\b(?:scene|cue)\s*#?\d+(?:'s)?\s+(?:narration|script|voiceover|text)\s+(?:to\s+|say\s+)?["“]?(.+?)["”]?\s*$/i.exec(
      command,
    ) ||
    /\bmake\s+(?:scene|cue)\s*#?\d+\s+say\s+["“]?(.+?)["”]?\s*$/i.exec(command);
  if (sceneIdx !== null && narrationEdit && nextScript.scenes[sceneIdx]) {
    nextScript.scenes[sceneIdx].narration = narrationEdit[1].trim();
    scriptDirty = true;
    changes.push(`Updated Scene ${sceneIdx + 1} narration`);
  }

  // 11. Add a new scene: "add a scene about pricing and onboarding"
  const addSceneMatch = /\badd\s+(?:a\s+|an\s+|new\s+)?(?:scene|cue|clip)\s*(?:about|on|for|covering|with)?\s*(.*)$/i.exec(
    command,
  );
  if (addSceneMatch && nextScript.scenes.length < MAX_SCENES) {
    const topic = addSceneMatch[1].replace(/[.!?]+$/, "").trim() || project.prompt;
    const query = extractVisualKeywords(topic, "modern studio workspace");
    const exclude = nextScript.scenes
      .map((s) => s.mediaId)
      .filter((id): id is string => Boolean(id));
    const matched = await matchBestStockVideo(query, exclude, undefined, project.prompt, activePeople);
    const newScene: Scene = hydrateSceneMedia({
      id: randomUUID(),
      narration: `Let us also look at ${topic} — a crucial detail that brings the whole story together.`,
      caption: topic.split(/\s+/).slice(0, 4).join(" "),
      mediaQuery: query,
      mediaId: matched?.id ?? null,
      mediaType: "video",
      mediaUrl: matched ? previewUrlForAsset(matched) : null,
      mediaThumb: matched?.thumb ?? null,
      mediaTitle: matched?.title ?? null,
      mediaCreator: matched?.creator ?? null,
      mediaProvider: matched?.provider ?? "pexels",
      duration: null,
      transition: "fade",
    });
    nextScript.scenes.push(newScene);
    scriptDirty = true;
    changes.push(`Added Scene ${nextScript.scenes.length} ("${topic.slice(0, 40)}")`);
  }

  // 12. Make script shorter / faster / rewrite whole tone
  if (/\b(make\s+(?:it|the\s+video|the\s+script)\s+shorter|shorten|trim\s+script|faster\s+pace)\b/i.test(lower)) {
    nextScript.scenes = nextScript.scenes.map((scene) => {
      const firstSentence = scene.narration.match(/[^.!?]+[.!?]+/)?.[0]?.trim();
      return firstSentence ? { ...scene, narration: firstSentence } : scene;
    });
    if (nextScript.scenes.length > 4) {
      nextScript.scenes = nextScript.scenes.slice(0, 4);
    }
    patch.duration = Math.max(15, Math.min(30, project.duration - 15));
    scriptDirty = true;
    changes.push("Tightened script narration for faster pacing");
  }

  // 13. Tone & global rewrite
  const toneMatch = /\b(energetic|professional|friendly|cinematic|minimal)\b/i.exec(lower);
  if (toneMatch && !/\bmusic|caption|subtitle\b/i.test(lower)) {
    const newTone = toneMatch[1].toLowerCase() as Tone;
    patch.tone = newTone;
    changes.push(`Tone → ${newTone}`);
    if (/\b(rewrite|redraft|regenerate|script|video)\b/i.test(lower)) {
      const regenerated = await generateScript({
        prompt: project.prompt,
        duration: patch.duration ?? project.duration,
        tone: newTone,
        language: patch.language ?? project.language,
        workflow: nextScript.options?.workflow,
        musicTrack: nextScript.options?.musicTrack,
        musicVolume: nextScript.options?.musicVolume,
        captionMode: nextScript.options?.captionMode,
        peopleRepresentation: activePeople,
      });
      nextScript.scenes = regenerated.scenes;
      nextScript.summary = regenerated.summary;
      scriptDirty = true;
      changes.push(`Redrafted script in ${newTone} tone`);
    }
  } else if (/\b(rewrite|regenerate|redraft)\s+(?:the\s+)?(?:whole\s+)?script\b/i.test(lower)) {
    const regenerated = await generateScript({
      prompt: project.prompt,
      duration: patch.duration ?? project.duration,
      tone: patch.tone ?? project.tone,
      language: patch.language ?? project.language,
      workflow: nextScript.options?.workflow,
      musicTrack: nextScript.options?.musicTrack,
      musicVolume: nextScript.options?.musicVolume,
      captionMode: nextScript.options?.captionMode,
      peopleRepresentation: activePeople,
    });
    nextScript.scenes = regenerated.scenes;
    nextScript.summary = regenerated.summary;
    scriptDirty = true;
    changes.push("Redrafted full script and matched fresh B-roll");
  }

  // 14. Fallback: if user typed a general footage/topic swap like "use space footage" or "make it about solar energy"
  if (changes.length === 0) {
    const visualFallback = extractVisualKeywords(command, "");
    if (visualFallback) {
      const targetIdx = sceneIdx ?? 0;
      const matched = await matchBestStockVideo(visualFallback, [], undefined, project.prompt, activePeople);
      if (matched && nextScript.scenes[targetIdx]) {
        nextScript.scenes[targetIdx] = hydrateSceneMedia({
          ...nextScript.scenes[targetIdx],
          mediaQuery: visualFallback,
          mediaId: matched.id,
          mediaType: "video",
          mediaUrl: previewUrlForAsset(matched),
          mediaThumb: matched.thumb,
          mediaTitle: matched.title,
          mediaCreator: matched.creator,
          mediaProvider: matched.provider,
        });
        scriptDirty = true;
        changes.push(
          `Updated Scene ${targetIdx + 1} visuals for "${visualFallback}" (${matched.provider})`,
        );
      }
    }
  }

  if (scriptDirty) {
    patch.script = nextScript;
  }

  return {
    patch,
    changes,
    handled: changes.length > 0,
  };
}

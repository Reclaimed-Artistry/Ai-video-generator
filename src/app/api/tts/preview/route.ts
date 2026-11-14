import { synthesizeSpeech } from "@/lib/tts";
import { getVoice } from "@/lib/voices";
import { isClonedVoiceId, resolveVoiceSelection } from "@/lib/voiceclone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    voiceId?: string;
    text?: string;
    language?: string;
  };

  // Cloned voices carry their own sample text; builtin personas ship a default.
  const resolved = isClonedVoiceId(body.voiceId)
    ? await resolveVoiceSelection(body.voiceId, body.language ?? "en")
    : null;
  const persona = getVoice(body.voiceId ?? "ava");

  const text = (body.text ?? persona.previewText).slice(0, 240);

  try {
    const speech = await synthesizeSpeech(
      text,
      body.voiceId ?? persona.id,
      body.language ?? "en",
    );
    return new Response(new Uint8Array(speech.data), {
      headers: {
        "content-type": speech.ext === "wav" ? "audio/wav" : "audio/mpeg",
        "cache-control": "no-store",
        "x-voice-label": encodeURIComponent(resolved?.label ?? persona.name),
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Preview failed" },
      { status: 500 },
    );
  }
}

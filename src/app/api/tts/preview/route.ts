import { synthesizeSpeech } from "@/lib/tts";
import { getVoice } from "@/lib/voices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    voiceId?: string;
    text?: string;
  };
  const voice = getVoice(body.voiceId ?? "ava");
  const text = (body.text ?? voice.previewText).slice(0, 240);
  try {
    const speech = await synthesizeSpeech(text, voice.id);
    return new Response(new Uint8Array(speech.data), {
      headers: {
        "content-type": speech.ext === "wav" ? "audio/wav" : "audio/mpeg",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Preview failed" },
      { status: 500 },
    );
  }
}

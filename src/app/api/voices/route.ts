import { NextResponse } from "next/server";
import { dubProviderStatus } from "@/lib/dub";
import { imageProviderStatus } from "@/lib/imagen";
import { providerStatus } from "@/lib/stock";
import { clonedVoiceRef, listClonedVoices, voiceCloneStatus, CLONE_PREFIX } from "@/lib/voiceclone";
import { activeTtsProvider, VOICES } from "@/lib/voices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const cloned = await listClonedVoices().catch(() => []);

  return NextResponse.json({
    voices: VOICES,
    provider: activeTtsProvider(),
    providers: providerStatus(),
    clonedVoices: cloned.map((voice) => ({
      ...voice,
      /** Value a project stores in `project.voice` to use this voice. */
      voiceId: clonedVoiceRef(voice.id),
    })),
    cloneStatus: voiceCloneStatus(),
    dubStatus: dubProviderStatus(),
    imageStatus: imageProviderStatus(),
    clonePrefix: CLONE_PREFIX,
  });
}

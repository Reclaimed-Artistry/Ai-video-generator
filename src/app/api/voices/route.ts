import { NextResponse } from "next/server";
import { dubProviderStatus } from "@/lib/dub";
import { imageProviderStatus } from "@/lib/imagen";
import { providerStatus } from "@/lib/stock";
import { listClonedVoices, voiceCloneStatus, CLONE_PREFIX } from "@/lib/voiceclone";
import { activeTtsProvider, VOICES } from "@/lib/voices";
import { aiVideoStatus } from "@/lib/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const cloned = await listClonedVoices().catch(() => []);

  return NextResponse.json({
    voices: VOICES,
    provider: activeTtsProvider(),
    providers: providerStatus(),
    // `voiceId` is already derived by `toClonedVoice`, so the POST (clone)
    // route and this list agree on how a project references a cloned voice.
    clonedVoices: cloned,
    cloneStatus: voiceCloneStatus(),
    dubStatus: dubProviderStatus(),
    imageStatus: imageProviderStatus(),
    videoStatus: aiVideoStatus(),
    clonePrefix: CLONE_PREFIX,
  });
}

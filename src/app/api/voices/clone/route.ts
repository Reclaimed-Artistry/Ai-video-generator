import { NextResponse } from "next/server";
import {
  createClonedVoice,
  listClonedVoices,
  voiceCloneStatus,
  type VoiceCloneSample,
} from "@/lib/voiceclone";
import { VOICES } from "@/lib/voices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_SAMPLES = 5;
const MAX_SAMPLE_BYTES = 12 * 1024 * 1024;

export async function GET() {
  const [voices, status] = await Promise.all([
    listClonedVoices(),
    Promise.resolve(voiceCloneStatus()),
  ]);
  return NextResponse.json({ clonedVoices: voices, status });
}

export async function POST(request: Request) {
  const status = voiceCloneStatus();

  const contentType = request.headers.get("content-type") ?? "";
  let name = "My Voice";
  let description: string | null = null;
  let gender: "male" | "female" | "neutral" = "neutral";
  let samples: VoiceCloneSample[] = [];
  let preset: { baseVoice: string; rate: number; pitch: number } | undefined;

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: "Malformed upload" }, { status: 400 });
    name = String(form.get("name") ?? name);
    description = (form.get("description") as string | null) ?? null;
    gender = (form.get("gender") as typeof gender) ?? gender;
    const files = form
      .getAll("samples")
      .filter((entry): entry is File => entry instanceof File)
      .slice(0, MAX_SAMPLES)
      .filter((file) => file.size <= MAX_SAMPLE_BYTES);
    samples = await Promise.all(
      files.map(async (file) => ({
        name: file.name || "sample.mp3",
        data: Buffer.from(await file.arrayBuffer()),
        contentType: file.type || "audio/mpeg",
      })),
    );
    const baseVoice = form.get("baseVoice");
    if (typeof baseVoice === "string") {
      preset = {
        baseVoice,
        rate: Number(form.get("rate") ?? 0) || 0,
        pitch: Number(form.get("pitch") ?? 0) || 0,
      };
    }
  } else {
    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      description?: string;
      gender?: "male" | "female" | "neutral";
      preset?: { baseVoice: string; rate: number; pitch: number };
    };
    name = body.name ?? name;
    description = body.description ?? null;
    gender = body.gender ?? gender;
    preset = body.preset;
  }

  if (!preset) {
    preset = { baseVoice: VOICES[0].id, rate: 0, pitch: 0 };
  }

  if (status.neural && samples.length === 0) {
    // Neural cloning is configured but nothing was uploaded — say so plainly
    // instead of silently creating a preset.
    return NextResponse.json(
      { error: "Upload at least one audio sample to create a neural voice clone." },
      { status: 400 },
    );
  }

  try {
    const result = await createClonedVoice({ name, description, gender, samples, preset });
    return NextResponse.json(
      {
        clonedVoice: result.voice,
        neural: result.neural,
        warning: result.warning ?? null,
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Voice cloning failed" },
      { status: 502 },
    );
  }
}

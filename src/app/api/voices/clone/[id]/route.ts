import { NextResponse } from "next/server";
import { deleteClonedVoice } from "@/lib/voiceclone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  const removed = await deleteClonedVoice(id);
  if (!removed) {
    return NextResponse.json({ error: "Voice not found" }, { status: 404 });
  }
  return NextResponse.json({ deleted: true, clonedVoice: removed });
}

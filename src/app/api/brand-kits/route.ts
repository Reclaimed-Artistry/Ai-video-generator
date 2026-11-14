import { NextResponse } from "next/server";
import {
  createBrandKit,
  getDefaultBrandKit,
  listBrandKits,
  type BrandKitInput,
} from "@/lib/brandkit";
import type { BrandFontId } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [kits, defaultKit] = await Promise.all([
    listBrandKits(),
    getDefaultBrandKit(),
  ]);
  return NextResponse.json({ brandKits: kits, defaultId: defaultKit?.id ?? null });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as BrandKitInput & {
    font?: BrandFontId;
  };
  try {
    const kit = await createBrandKit(body);
    return NextResponse.json({ brandKit: kit }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create brand kit" },
      { status: 500 },
    );
  }
}

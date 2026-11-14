"use client";

import { Check, ImagePlus, Loader2, Search, Sparkles, Video } from "lucide-react";
import { useState } from "react";
import { Notice, Spinner } from "@/components/ui";
import { readJson, readJsonObject, responseError } from "@/lib/http";
import type { ImageProviderStatus } from "@/lib/imagen";
import { formatClock } from "@/lib/timecode";
import type { AspectRatio, Resolution, Scene, StockAsset } from "@/lib/types";

type GeneratedImage = {
  url: string;
  key: string;
  provider: string;
  prompt: string;
  fallback: boolean;
};

export default function MediaPanel({
  scene,
  projectId,
  aspect,
  resolution,
  primaryColor,
  onApply,
}: {
  scene: Scene | null;
  projectId: string;
  aspect: AspectRatio;
  resolution: Resolution;
  primaryColor?: string;
  onApply: (patch: Partial<Scene>) => void;
}) {
  const [query, setQuery] = useState(scene?.mediaQuery ?? "");
  const [assets, setAssets] = useState<StockAsset[]>([]);
  const [searching, setSearching] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState<{ tone: "info" | "success" | "danger"; text: string } | null>(
    null,
  );
  const [imageStatus, setImageStatus] = useState<ImageProviderStatus | null>(
    null,
  );

  async function search(nextQuery?: string) {
    const term = (nextQuery ?? query).trim();
    if (!term) return;
    setSearching(true);
    setStatus(null);
    try {
      const response = await fetch(
        `/api/media/search?q=${encodeURIComponent(term)}&limit=18`,
      );
      const data = await readJsonObject<{ assets?: StockAsset[] }>(response);
      setAssets(data.assets ?? []);
      if ((data.assets ?? []).length === 0) {
        setStatus({ tone: "info", text: "No clips matched. Try a simpler phrase." });
      }
    } catch {
      setStatus({ tone: "danger", text: "Stock search is unavailable right now." });
    } finally {
      setSearching(false);
    }
  }

  async function generate() {
    const prompt = query.trim() || scene?.mediaQuery || scene?.caption || "abstract cinematic texture";
    setGenerating(true);
    setStatus(null);
    try {
      const response = await fetch("/api/imagen", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt,
          aspect,
          resolution,
          projectId,
          primaryColor,
        }),
      });
      const data = await readJson<{ image?: GeneratedImage; status?: ImageProviderStatus; error?: string }>(
        response,
      );
      if (!response.ok) throw new Error(responseError(data, response, "Image generation failed"));
      const image = data?.image;
      if (!image) throw new Error("The server did not return an image.");

      const storedUrl = image.url.startsWith("http") ? image.url : `/api/files/${image.url}`;
      onApply({
        mediaQuery: prompt,
        mediaUrl: storedUrl,
        mediaThumb: storedUrl,
        mediaType: "photo",
        mediaOrigin: "generated",
        generated: { prompt: image.prompt, provider: image.provider, fallback: image.fallback },
        mediaTitle: image.fallback ? "On-device plate" : "AI-generated scene",
        mediaCreator: null,
        mediaProvider: image.provider,
        mediaId: null,
      });
      setImageStatus(data?.status ?? null);
      setStatus({
        tone: image.fallback ? "info" : "success",
        text: image.fallback
          ? "No image API key found — generated a brand-tinted abstract plate on device."
          : `Generated with ${image.provider}. Applied to this scene.`,
      });
    } catch (error) {
      setStatus({
        tone: "danger",
        text: error instanceof Error ? error.message : "Image generation failed",
      });
    } finally {
      setGenerating(false);
    }
  }

  async function loadStatus() {
    const response = await fetch("/api/imagen").catch(() => null);
    const data = response?.ok ? await readJson<{ status?: ImageProviderStatus }>(response) : null;
    if (data?.status) setImageStatus(data.status);
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="eyebrow mb-2">Scene media</p>
        {scene ? (
          <p className="line-clamp-2 text-xs leading-relaxed text-stone-ink">
            {scene.narration || scene.caption || "Untitled scene"}
          </p>
        ) : (
          <p className="text-xs text-stone-ink">Select a scene to change its visuals.</p>
        )}
      </div>

      <div className="flex gap-1.5">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void search();
          }}
          placeholder="Search footage…"
          className="field"
          aria-label="Search stock footage"
        />
        <button
          type="button"
          onClick={() => void search()}
          disabled={searching || !query.trim()}
          className="btn btn-secondary shrink-0 px-3"
          aria-label="Search"
        >
          {searching ? <Spinner /> : <Search className="h-4 w-4" />}
        </button>
      </div>

      <button
        type="button"
        onClick={() => void generate()}
        disabled={generating || !scene}
        className="btn btn-primary w-full"
      >
        {generating ? <Spinner /> : <Sparkles className="h-4 w-4" />}
        {generating ? "Generating…" : "Generate scene with AI"}
      </button>

      {!imageStatus ? (
        <button
          type="button"
          onClick={() => void loadStatus()}
          className="text-[11px] font-semibold text-amber-cue hover:text-amber-hover"
        >
          Which image model am I using?
        </button>
      ) : (
        <Notice tone={imageStatus.configured ? "success" : "info"}>
          <strong>{imageStatus.label}.</strong> {imageStatus.note}
        </Notice>
      )}

      {status ? <Notice tone={status.tone}>{status.text}</Notice> : null}

      <div>
        <p className="eyebrow mb-2">Stock footage</p>
        {assets.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong bg-inset/60 px-3 py-6 text-center">
            <Video className="mx-auto h-5 w-5 text-ash" />
            <p className="mt-2 text-xs text-stone-ink">
              Search to pull licensed clips into this scene.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {assets.map((asset) => {
              const active = scene?.mediaId === asset.id;
              return (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() =>
                    onApply({
                      mediaId: asset.id,
                      mediaUrl: asset.sources[0]?.url ?? null,
                      mediaThumb: asset.thumb,
                      mediaType: asset.type,
                      mediaOrigin: "stock",
                      generated: undefined,
                      mediaTitle: asset.title,
                      mediaCreator: asset.creator,
                      mediaProvider: asset.provider,
                      mediaQuery: query,
                    })
                  }
                  className={`group relative overflow-hidden rounded-lg border transition-colors ${
                    active
                      ? "border-amber-cue ring-2 ring-amber-cue/25"
                      : "border-line hover:border-brand-ring"
                  }`}
                  title={asset.title}
                >
                  <div className="relative aspect-video bg-night">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={asset.thumb}
                      alt={asset.title}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                    {active ? (
                      <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-amber-cue text-white">
                        <Check className="h-3 w-3" />
                      </span>
                    ) : null}
                  </div>
                  <div className="px-2 py-1.5 text-left">
                    <p className="truncate text-[11px] font-medium text-paper">{asset.title}</p>
                    <p className="font-tech text-[10px] text-ash">
                      {asset.provider} · {formatClock(asset.duration ?? 8)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {scene?.mediaOrigin === "generated" ? (
        <Notice tone="success">
          This scene uses{" "}
          {scene.generated?.fallback ? "an on-device generated plate" : "AI-generated imagery"}
          {scene.generated?.provider ? ` via ${scene.generated.provider}` : ""}.
          <button
            type="button"
            onClick={() => void generate()}
            className="ml-1 inline-flex items-center gap-1 font-semibold underline"
          >
            <ImagePlus className="h-3 w-3" />
            Regenerate
          </button>
        </Notice>
      ) : null}

      {generating ? (
        <div className="flex items-center gap-2 text-xs text-ash">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Composing your scene plate…
        </div>
      ) : null}
    </div>
  );
}

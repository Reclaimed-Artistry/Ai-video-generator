"use client";

import { Check, ImagePlus, Loader2, Palette, Plus, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ColorField, Field, Notice, Spinner, Toggle } from "@/components/ui";
import {
  BRAND_FONTS,
  type BrandFontId,
  type BrandKit,
} from "@/lib/types";

const SWATCHES = ["#6D4AFF", "#F0568F", "#2C7BF2", "#12946A", "#D98614", "#14162B"];

const EMPTY = {
  name: "My Brand",
  primaryColor: "#6D4AFF",
  accentColor: "#FFFFFF",
  font: "dejavu" as BrandFontId,
  introTitle: "",
  introSubtitle: "",
  outroText: "",
  website: "",
  showLogo: true,
};

export default function DesignPanel({
  projectId,
  brandKitId,
  onAssigned,
}: {
  projectId: string;
  brandKitId: string | null;
  onAssigned: (kitId: string | null) => void;
}) {
  const [kits, setKits] = useState<BrandKit[]>([]);
  const [draft, setDraft] = useState({ ...EMPTY });
  const [kitId, setKitId] = useState<string | null>(brandKitId);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ tone: "info" | "success" | "danger"; text: string } | null>(
    null,
  );
  const fileRef = useRef<HTMLInputElement | null>(null);

  function applyKit(kit: BrandKit) {
    setKitId(kit.id);
    setDraft({
      name: kit.name,
      primaryColor: kit.primaryColor,
      accentColor: kit.accentColor,
      font: kit.font,
      introTitle: kit.introTitle ?? "",
      introSubtitle: kit.introSubtitle ?? "",
      outroText: kit.outroText ?? "",
      website: kit.website ?? "",
      showLogo: kit.showLogo,
    });
    setLogoUrl(kit.logoUrl ?? (kit.logoPath ? `/api/files/${kit.logoPath}` : null));
  }

  // Deferred to a timer so the fetch — and the state updates it triggers —
  // never runs synchronously inside the effect body (avoids cascading renders).
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        setBusy(true);
        try {
          const response = await fetch("/api/brand-kits");
          const data = await response.json();
          if (cancelled) return;
          const list: BrandKit[] = data.brandKits ?? [];
          setKits(list);
          const active = brandKitId ? list.find((kit) => kit.id === brandKitId) : list[0];
          if (active) applyKit(active);
        } finally {
          if (!cancelled) setBusy(false);
        }
      })();
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(thenAssign = false) {
    if (!kitId) return;
    setSaving(true);
    setStatus(null);
    try {
      const response = await fetch(`/api/brand-kits/${kitId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...draft,
          introTitle: draft.introTitle || null,
          introSubtitle: draft.introSubtitle || null,
          outroText: draft.outroText || null,
          website: draft.website || null,
        }),
      });
      if (!response.ok) throw new Error("Could not save the brand kit");
      if (thenAssign) await assign(kitId);
      setStatus({ tone: "success", text: "Brand kit saved." });
    } catch (error) {
      setStatus({
        tone: "danger",
        text: error instanceof Error ? error.message : "Could not save the brand kit",
      });
    } finally {
      setSaving(false);
    }
  }

  async function assign(id: string | null) {
    const response = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ brandKitId: id }),
    });
    if (!response.ok) throw new Error("Could not apply this brand kit");
    setKitId(id);
    onAssigned(id);
  }

  async function createKit() {
    setSaving(true);
    try {
      const response = await fetch("/api/brand-kits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "New brand", isDefault: kits.length === 0 }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not create a brand kit");
      const created: BrandKit = data.brandKit;
      setKits((prev) => [created, ...prev]);
      applyKit(created);
      await assign(created.id);
      setStatus({ tone: "success", text: "New brand kit created and applied." });
    } catch (error) {
      setStatus({
        tone: "danger",
        text: error instanceof Error ? error.message : "Could not create a brand kit",
      });
    } finally {
      setSaving(false);
    }
  }

  async function uploadLogo(file: File) {
    if (!kitId) return;
    setSaving(true);
    setStatus(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(`/api/brand-kits/${kitId}/logo`, {
        method: "POST",
        body: form,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Logo upload failed");
      // Use the server-resolved `logoUrl` rather than building one from `key`:
      // with Vercel Blob configured, `key` is an absolute https URL and
      // prefixing `/api/files/` onto it would produce a broken path.
      setLogoUrl(
        data.brandKit?.logoUrl ??
          (data.key?.startsWith("http") ? data.key : `/api/files/${data.key}?v=${Date.now()}`),
      );
      setStatus({ tone: "success", text: "Logo uploaded. It will burn into every render." });
    } catch (error) {
      setStatus({
        tone: "danger",
        text: error instanceof Error ? error.message : "Logo upload failed",
      });
    } finally {
      setSaving(false);
    }
  }

  async function removeLogo() {
    if (!kitId) return;
    setSaving(true);
    try {
      await fetch(`/api/brand-kits/${kitId}/logo`, { method: "DELETE" });
      setLogoUrl(null);
      setStatus({ tone: "info", text: "Logo removed." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="eyebrow">Brand kit</p>
        <button type="button" onClick={() => void createKit()} className="btn btn-ghost px-2 py-1 text-[11px]">
          <Plus className="h-3.5 w-3.5" />
          New
        </button>
      </div>

      {kits.length > 1 ? (
        <select
          value={kitId ?? ""}
          onChange={(event) => {
            const next = kits.find((kit) => kit.id === event.target.value);
            if (next) {
              applyKit(next);
              void assign(next.id).catch(() => undefined);
            }
          }}
          className="field"
          aria-label="Select brand kit"
        >
          {kits.map((kit) => (
            <option key={kit.id} value={kit.id}>
              {kit.name}
              {kit.isDefault ? " (default)" : ""}
            </option>
          ))}
        </select>
      ) : null}

      {busy ? (
        <div className="flex items-center gap-2 text-xs text-ash">
          <Spinner /> Loading brand kit…
        </div>
      ) : !kitId ? (
        <div className="space-y-3">
          <Notice tone="info">
            No brand kit yet. Create one to add your logo, palette and intro/outro cards.
          </Notice>
          <button type="button" onClick={() => void createKit()} className="btn btn-primary w-full">
            <Palette className="h-4 w-4" />
            Create brand kit
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="Brand name">
            <input
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              className="field"
              placeholder="Acme Studios"
            />
          </Field>

          <Field label="Primary colour" hint="Captions highlight, title cards">
            <ColorField
              value={draft.primaryColor}
              onChange={(primaryColor) => setDraft({ ...draft, primaryColor })}
              swatches={SWATCHES}
            />
          </Field>

          <Field label="Text colour" hint="Caption fill">
            <ColorField
              value={draft.accentColor}
              onChange={(accentColor) => setDraft({ ...draft, accentColor })}
              swatches={["#FFFFFF", "#FFF3D6", "#14162B", "#E8E4FF"]}
            />
          </Field>

          <Field label="Caption typeface">
            <select
              value={draft.font}
              onChange={(event) => setDraft({ ...draft, font: event.target.value as BrandFontId })}
              className="field"
            >
              {BRAND_FONTS.map((font) => (
                <option key={font.id} value={font.id}>
                  {font.label}
                </option>
              ))}
            </select>
          </Field>

          <div className="border-t border-line pt-4">
            <p className="eyebrow mb-3">Logo bug</p>
            <div className="flex items-start gap-3">
              <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-inset">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="Brand logo" className="h-full w-full object-contain" />
                ) : (
                  <ImagePlus className="h-5 w-5 text-ash" />
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="btn btn-secondary w-full"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {logoUrl ? "Replace logo" : "Upload logo"}
                </button>
                {logoUrl ? (
                  <button
                    type="button"
                    onClick={() => void removeLogo()}
                    className="btn btn-ghost w-full text-tally"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </button>
                ) : null}
                <p className="text-[11px] leading-snug text-ash">
                  PNG with transparency works best. Shown top-right on every scene.
                </p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadLogo(file);
                  event.target.value = "";
                }}
              />
            </div>
            <div className="mt-3">
              <Toggle
                checked={draft.showLogo}
                onChange={(showLogo) => setDraft({ ...draft, showLogo })}
                label="Show logo on video"
                description="Burn the logo into the top-right corner of every scene."
              />
            </div>
          </div>

          <div className="space-y-3 border-t border-line pt-4">
            <p className="eyebrow">Title cards</p>
            <Field label="Intro title">
              <input
                value={draft.introTitle}
                onChange={(event) => setDraft({ ...draft, introTitle: event.target.value })}
                className="field"
                placeholder="Acme Studios"
              />
            </Field>
            <Field label="Intro subtitle">
              <input
                value={draft.introSubtitle}
                onChange={(event) => setDraft({ ...draft, introSubtitle: event.target.value })}
                className="field"
                placeholder="Crafted without shortcuts"
              />
            </Field>
            <Field label="Outro text">
              <input
                value={draft.outroText}
                onChange={(event) => setDraft({ ...draft, outroText: event.target.value })}
                className="field"
                placeholder="Thanks for watching"
              />
            </Field>
            <Field label="Website / handle">
              <input
                value={draft.website}
                onChange={(event) => setDraft({ ...draft, website: event.target.value })}
                className="field"
                placeholder="acme.example"
              />
            </Field>
            <p className="text-[11px] leading-snug text-ash">
              Cards add ~3.4s at the start and ~3.6s at the end, rendered in your brand
              colours.
            </p>
          </div>

          <div className="flex gap-2 border-t border-line pt-4">
            <button
              type="button"
              onClick={() => void save(true)}
              disabled={saving}
              className="btn btn-primary flex-1"
            >
              {saving ? <Spinner /> : <Check className="h-4 w-4" />}
              Save &amp; apply
            </button>
          </div>

          {status ? <Notice tone={status.tone}>{status.text}</Notice> : null}
        </div>
      )}
    </div>
  );
}

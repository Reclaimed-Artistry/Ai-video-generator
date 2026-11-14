"use client";

import { AudioLines, Globe2, Loader2, Square, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Field, Notice, Spinner } from "@/components/ui";
import { LANGUAGES } from "@/lib/types";
import { VOICES } from "@/lib/voices";

type ClonedVoice = {
  id: string;
  name: string;
  provider: string;
  accent: string;
  description: string | null;
  sampleCount: number;
  voiceId: string;
};

type CloneStatus = {
  provider: "elevenlabs" | "preset";
  label: string;
  note: string;
  neural: boolean;
  maxSamples: number;
  recommendedSeconds: string;
};

type DubStatus = { label: string; note: string; configured: boolean };

export default function VoicePanel({
  projectId,
  voice,
  language,
  onVoiceChange,
  onDubbed,
}: {
  projectId: string;
  voice: string;
  language: string;
  onVoiceChange: (voiceId: string) => void;
  onDubbed?: (payload: { language: string; changes: string[] }) => void;
}) {
  const [cloned, setCloned] = useState<ClonedVoice[]>([]);
  const [cloneStatus, setCloneStatus] = useState<CloneStatus | null>(null);
  const [dubStatus, setDubStatus] = useState<DubStatus | null>(null);
  const [name, setName] = useState("");
  const [baseVoice, setBaseVoice] = useState(VOICES[0].id);
  const [rate, setRate] = useState(0);
  const [pitch, setPitch] = useState(0);
  const [busy, setBusy] = useState(false);
  const [auditioning, setAuditioning] = useState(false);
  const [status, setStatus] = useState<{ tone: "info" | "success" | "danger"; text: string } | null>(
    null,
  );

  const [dubLanguage, setDubLanguage] = useState("es");
  const [dubGender, setDubGender] = useState<"female" | "male">("female");
  const [dubbing, setDubbing] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void fetch("/api/voices")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!data) return;
        setCloned(data.clonedVoices ?? []);
        setCloneStatus(data.cloneStatus ?? null);
        setDubStatus(data.dubStatus ?? null);
      })
      .catch(() => undefined);
  }, []);

  async function audition(voiceId: string) {
    if (auditioning && audioRef.current) {
      audioRef.current.pause();
      setAuditioning(false);
      return;
    }
    setAuditioning(true);
    try {
      const response = await fetch("/api/tts/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          voiceId,
          text: "This is how your narrator will sound in the finished video.",
          language,
        }),
      });
      if (!response.ok) throw new Error("Preview unavailable");
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src = URL.createObjectURL(await response.blob());
      audioRef.current.onended = () => setAuditioning(false);
      audioRef.current.onerror = () => setAuditioning(false);
      await audioRef.current.play();
    } catch {
      setAuditioning(false);
    }
  }

  async function createVoice(files: File[]) {
    setBusy(true);
    setStatus(null);
    try {
      const form = new FormData();
      form.append("name", name.trim() || "My Voice");
      form.append("baseVoice", baseVoice);
      form.append("rate", String(rate));
      form.append("pitch", String(pitch));
      files.slice(0, 5).forEach((file) => form.append("samples", file));

      const response = await fetch("/api/voices/clone", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not create the voice");

      setCloned((prev) => [data.clonedVoice, ...prev]);
      onVoiceChange(data.clonedVoice.voiceId);
      setName("");
      setStatus({
        tone: data.neural ? "success" : "info",
        text: data.neural
          ? `“${data.clonedVoice.name}” cloned and selected.`
          : (data.warning ?? "Saved as a reusable voice preset."),
      });
    } catch (error) {
      setStatus({
        tone: "danger",
        text: error instanceof Error ? error.message : "Could not create the voice",
      });
    } finally {
      setBusy(false);
    }
  }

  async function removeVoice(id: string) {
    await fetch(`/api/voices/clone/${id}`, { method: "DELETE" }).catch(() => undefined);
    setCloned((prev) => prev.filter((item) => item.id !== id));
  }

  async function dub() {
    setDubbing(true);
    setStatus(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/dub`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetLanguage: dubLanguage, voiceGender: dubGender }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Dubbing failed");
      onDubbed?.({ language: data.project?.language ?? dubLanguage, changes: data.changes ?? [] });
      setStatus({
        tone: data.translated ? "success" : "info",
        text: (data.changes ?? []).join(" · ") || "Dubbing applied.",
      });
    } catch (error) {
      setStatus({
        tone: "danger",
        text: error instanceof Error ? error.message : "Dubbing failed",
      });
    } finally {
      setDubbing(false);
    }
  }

  const neural = cloneStatus?.neural ?? false;

  return (
    <div className="space-y-5">
      {/* Narrator ---------------------------------------------------------- */}
      <div>
        <p className="eyebrow mb-2">Narrator</p>
        <select
          value={voice}
          onChange={(event) => onVoiceChange(event.target.value)}
          className="field mb-2"
          aria-label="Narrator voice"
        >
          {cloned.length > 0 ? (
            <optgroup label="My voices">
              {cloned.map((item) => (
                <option key={item.id} value={item.voiceId}>
                  {item.name} — {item.provider === "elevenlabs" ? "cloned" : "preset"}
                </option>
              ))}
            </optgroup>
          ) : null}
          <optgroup label="AI presenters">
            {VOICES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} — {item.style} ({item.accent})
              </option>
            ))}
          </optgroup>
        </select>
        <button type="button" onClick={() => void audition(voice)} className="btn btn-secondary w-full">
          {auditioning ? (
            <>
              <Square className="h-3 w-3 fill-current" />
              Stop preview
            </>
          ) : (
            <>
              <AudioLines className="h-3.5 w-3.5" />
              Preview voice
            </>
          )}
        </button>
      </div>

      {/* Voice cloning ----------------------------------------------------- */}
      <div className="border-t border-line pt-4">
        <p className="eyebrow mb-2">Voice cloning</p>

        {cloneStatus ? (
          <Notice tone={neural ? "success" : "info"}>
            <strong>{cloneStatus.label}.</strong> {cloneStatus.note}
            {neural ? (
              <span className="mt-1 block text-[11px] opacity-80">
                {cloneStatus.recommendedSeconds} · up to {cloneStatus.maxSamples} clips
              </span>
            ) : null}
          </Notice>
        ) : null}

        <div className="mt-3 space-y-2.5">
          <Field label="Voice name">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="field"
              placeholder="My Voice"
            />
          </Field>

          {!neural ? (
            <div className="grid grid-cols-3 gap-2">
              <Field label="Base" className="col-span-1">
                <select
                  value={baseVoice}
                  onChange={(event) => setBaseVoice(event.target.value)}
                  className="field"
                >
                  {VOICES.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={`Speed ${rate > 0 ? "+" : ""}${rate}%`}>
                <input
                  type="range"
                  min={-30}
                  max={30}
                  value={rate}
                  onChange={(event) => setRate(Number(event.target.value))}
                  className="h-1.5 w-full cursor-pointer rounded-full bg-line-strong"
                  style={{ accentColor: "var(--color-amber-cue)" }}
                />
              </Field>
              <Field label={`Pitch ${pitch > 0 ? "+" : ""}${pitch}Hz`}>
                <input
                  type="range"
                  min={-12}
                  max={12}
                  value={pitch}
                  onChange={(event) => setPitch(Number(event.target.value))}
                  className="h-1.5 w-full cursor-pointer rounded-full bg-line-strong"
                  style={{ accentColor: "var(--color-amber-cue)" }}
                />
              </Field>
            </div>
          ) : null}

          {neural ? (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="btn btn-secondary w-full"
            >
              <Upload className="h-3.5 w-3.5" />
              Choose voice samples
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => void createVoice([])}
            disabled={busy}
            className="btn btn-primary w-full"
          >
            {busy ? <Spinner /> : null}
            {neural ? "Upload samples to clone" : "Save voice preset"}
          </button>

          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            multiple
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              if (files.length > 0) void createVoice(files);
              event.target.value = "";
            }}
          />
        </div>

        {cloned.length > 0 ? (
          <div className="mt-3 space-y-1.5">
            {cloned.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-line bg-panel px-2.5 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-paper">{item.name}</p>
                  <p className="font-tech text-[10px] text-ash">
                    {item.provider === "elevenlabs" ? "Neural clone" : "Preset"} ·{" "}
                    {item.sampleCount} sample{item.sampleCount === 1 ? "" : "s"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void removeVoice(item.id)}
                  className="rounded-md p-1 text-ash transition-colors hover:bg-inset hover:text-tally"
                  aria-label={`Delete ${item.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* Dubbing ----------------------------------------------------------- */}
      <div className="border-t border-line pt-4">
        <p className="eyebrow mb-2">Dubbing</p>
        {dubStatus ? (
          <Notice tone={dubStatus.configured ? "success" : "info"}>
            <strong>{dubStatus.label}.</strong> {dubStatus.note}
          </Notice>
        ) : null}

        <div className="mt-3 space-y-2.5">
          <Field label="Target language">
            <select
              value={dubLanguage}
              onChange={(event) => setDubLanguage(event.target.value)}
              className="field"
            >
              {LANGUAGES.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label} ({option.native})
                </option>
              ))}
            </select>
          </Field>

          <Field label="Narrator">
            <div className="flex gap-0.5 rounded-lg border border-line bg-inset p-0.5">
              {(["female", "male"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setDubGender(option)}
                  className={`flex-1 rounded-md px-2 py-1 text-xs font-medium capitalize transition-colors ${
                    dubGender === option
                      ? "bg-panel text-paper shadow-soft"
                      : "text-stone-ink hover:text-paper"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </Field>

          <button
            type="button"
            onClick={() => void dub()}
            disabled={dubbing}
            className="btn btn-primary w-full"
          >
            {dubbing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Dubbing…
              </>
            ) : (
              <>
                <Globe2 className="h-4 w-4" />
                Dub this video
              </>
            )}
          </button>
          <p className="text-[11px] leading-snug text-ash">
            Rewrites every narration line and switches to a native-locale narrator. Re-render
            afterwards to hear it.
          </p>
        </div>
      </div>

      {status ? <Notice tone={status.tone}>{status.text}</Notice> : null}
    </div>
  );
}

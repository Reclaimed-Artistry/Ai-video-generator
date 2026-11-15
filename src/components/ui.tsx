"use client";

import { Check, Loader2, X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

/* ------------------------------------------------------------------ layout */

export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: "neutral" | "brand" | "success" | "warn" | "danger";
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "border-line-strong bg-inset text-stone-ink",
    brand: "border-transparent bg-brand-soft text-amber-hover",
    success: "border-transparent bg-nominal/12 text-nominal",
    warn: "border-transparent bg-caution/14 text-caution",
    danger: "border-transparent bg-tally/12 text-tally",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow ? <p className="eyebrow mb-1.5">{eyebrow}</p> : null}
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-paper sm:text-2xl">
          {title}
        </h2>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-sm text-stone-ink">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-line-strong bg-inset/60 px-6 py-12 text-center">
      <div className="grid h-11 w-11 place-items-center rounded-full bg-brand-soft text-amber-cue">
        {icon}
      </div>
      <p className="mt-3 text-sm font-semibold text-paper">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-xs text-stone-ink">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ inputs */

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.09em] text-ash">
        <span>{label}</span>
        {hint ? <span className="font-normal normal-case tracking-normal">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "md",
  className = "",
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: ReactNode; sub?: ReactNode }[];
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div
      className={`flex gap-0.5 rounded-lg border border-line bg-inset p-0.5 ${className}`}
      role="tablist"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={`flex-1 rounded-[7px] font-medium transition-colors ${
              size === "sm" ? "px-2 py-1 text-[11px]" : "px-2.5 py-1.5 text-xs"
            } ${
              active
                ? "bg-panel text-paper shadow-soft"
                : "text-stone-ink hover:text-paper"
            }`}
          >
            <span className="block">{option.label}</span>
            {option.sub ? (
              <span className="block text-[10px] font-normal text-ash">{option.sub}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-start gap-3 rounded-lg border border-line bg-panel px-3 py-2.5 text-left transition-colors hover:border-brand-ring"
    >
      <span
        className={`mt-0.5 flex h-4.5 w-8 shrink-0 items-center rounded-full px-0.5 transition-colors ${
          checked ? "bg-amber-cue" : "bg-line-strong"
        }`}
        style={{ height: 18 }}
      >
        <span
          className={`h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-3.5" : "translate-x-0"
          }`}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-paper">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-[11px] leading-snug text-stone-ink">
            {description}
          </span>
        ) : null}
      </span>
    </button>
  );
}

export function Slider({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
}) {
  return (
    <input
      type="range"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(event) => onChange(Number(event.target.value))}
      className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-line-strong accent-amber-cue"
      style={{ accentColor: "var(--color-amber-cue)" }}
    />
  );
}

export function ColorField({
  value,
  onChange,
  swatches,
}: {
  value: string;
  onChange: (next: string) => void;
  swatches?: string[];
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-9 shrink-0 cursor-pointer rounded-md border border-line-strong bg-panel p-0.5"
        aria-label="Brand colour"
      />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="field flex-1 font-tech uppercase"
        spellCheck={false}
      />
      {swatches?.length ? (
        <div className="flex shrink-0 gap-1">
          {swatches.map((swatch) => (
            <button
              key={swatch}
              type="button"
              onClick={() => onChange(swatch)}
              title={swatch}
              className={`h-6 w-6 rounded-md border transition-transform hover:scale-110 ${
                value.toLowerCase() === swatch.toLowerCase()
                  ? "border-paper ring-2 ring-amber-cue/40"
                  : "border-line-strong"
              }`}
              style={{ backgroundColor: swatch }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------- feedback */

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} aria-hidden="true" />;
}

export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "success" | "warn" | "danger";
  children: ReactNode;
}) {
  const tones: Record<string, string> = {
    info: "border-line-strong bg-inset text-stone-ink",
    success: "border-nominal/35 bg-nominal/10 text-nominal",
    warn: "border-caution/35 bg-caution/10 text-caution",
    danger: "border-tally/35 bg-tally/10 text-tally",
  };
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-relaxed ${tones[tone]}`}
    >
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-night/45 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        className={`relative z-10 flex max-h-[88vh] w-full flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-soft ${
          wide ? "max-w-3xl" : "max-w-lg"
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h3 className="text-sm font-semibold text-paper">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-ash transition-colors hover:bg-inset hover:text-paper"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-line bg-inset px-5 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ProgressBar({
  value,
  tone = "brand",
}: {
  value: number;
  tone?: "brand" | "success" | "danger";
}) {
  const tones: Record<string, string> = {
    brand: "bg-amber-cue",
    success: "bg-nominal",
    danger: "bg-tally",
  };
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
      <div
        className={`h-full rounded-full transition-[width] duration-300 ${tones[tone]}`}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export function CheckItem({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm text-stone-ink">
      <Check className="mt-0.5 h-4 w-4 shrink-0 text-nominal" />
      <span className="min-w-0">{children}</span>
    </li>
  );
}

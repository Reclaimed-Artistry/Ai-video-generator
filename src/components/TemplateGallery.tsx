"use client";

import {
  BarChart3,
  BookOpen,
  Boxes,
  CalendarDays,
  Clapperboard,
  Dumbbell,
  Film,
  Gem,
  GraduationCap,
  HandHeart,
  Hash,
  Heart,
  ListOrdered,
  Plane,
  Quote,
  Rocket,
  Sparkles,
  TrendingUp,
  Users,
  UtensilsCrossed,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { AspectGlyph } from "@/components/BrandMark";
import { formatClock } from "@/lib/timecode";
import {
  TEMPLATES,
  TEMPLATE_CATEGORIES,
  type TemplateCategory,
  type VideoTemplate,
} from "@/lib/templates";

const ICONS: Record<string, LucideIcon> = {
  Rocket,
  Heart,
  Boxes,
  Quote,
  ListOrdered,
  Hash,
  Clapperboard,
  Film,
  Zap,
  Sparkles,
  CalendarDays,
  UtensilsCrossed,
  GraduationCap,
  BookOpen,
  Users,
  TrendingUp,
  BarChart3,
  Briefcase: Boxes,
  Plane,
  Gem,
  Dumbbell,
  HandHeart,
};

function TemplateCard({
  template,
  onPick,
}: {
  template: VideoTemplate;
  onPick: (template: VideoTemplate) => void;
}) {
  const Icon = ICONS[template.icon] ?? Sparkles;
  return (
    <button
      type="button"
      onClick={() => onPick(template)}
      className="card card-hover group overflow-hidden text-left"
    >
      <div
        className={`relative flex h-28 items-center justify-center bg-gradient-to-br ${template.gradient}`}
      >
        <div className="grid-veil absolute inset-0 opacity-25" />
        <Icon className="relative h-9 w-9 text-white/95 drop-shadow-sm" />
        <span className="absolute bottom-2 left-2 rounded-full bg-night/45 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
          {template.category}
        </span>
      </div>

      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold leading-tight text-paper">{template.name}</p>
          <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-ash">
            <AspectGlyph aspect={template.aspect} className="h-3 w-3" />
            {template.aspect}
          </span>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-stone-ink">{template.blurb}</p>
        <div className="mt-3 flex items-center gap-2 text-[11px] text-ash">
          <span className="inline-flex items-center rounded-full bg-inset px-2 py-0.5 font-tech">
            {formatClock(template.duration)}
          </span>
          <span className="inline-flex items-center rounded-full bg-inset px-2 py-0.5 capitalize">
            {template.tone}
          </span>
        </div>
      </div>
    </button>
  );
}

export default function TemplateGallery({
  onPick,
  defaultCategory,
}: {
  onPick: (template: VideoTemplate) => void;
  defaultCategory?: TemplateCategory;
}) {
  const [category, setCategory] = useState<TemplateCategory | "All">(
    defaultCategory ?? "All",
  );

  const visible = useMemo(
    () =>
      category === "All"
        ? TEMPLATES
        : TEMPLATES.filter((template) => template.category === category),
    [category],
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {(["All", ...TEMPLATE_CATEGORIES] as const).map((option) => {
          const active = category === option;
          const count =
            option === "All"
              ? TEMPLATES.length
              : TEMPLATES.filter((template) => template.category === option).length;
          return (
            <button
              key={option}
              type="button"
              onClick={() => setCategory(option as TemplateCategory | "All")}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                active
                  ? "border-transparent bg-amber-cue text-white"
                  : "border-line-strong bg-panel text-stone-ink hover:border-brand-ring hover:text-paper"
              }`}
            >
              {option}
              <span className={`ml-1.5 font-tech ${active ? "text-white/75" : "text-ash"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visible.map((template) => (
          <TemplateCard key={template.id} template={template} onPick={onPick} />
        ))}
      </div>
    </div>
  );
}

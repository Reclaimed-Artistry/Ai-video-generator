import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
  toDriver(value: Buffer): Buffer {
    return value;
  },
  fromDriver(value: unknown): Buffer {
    if (Buffer.isBuffer(value)) return value;
    if (value instanceof Uint8Array) return Buffer.from(value);
    if (typeof value === "string" && value.startsWith("\\x")) {
      return Buffer.from(value.slice(2), "hex");
    }
    return Buffer.from(String(value ?? ""), "binary");
  },
});

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  prompt: text("prompt").notNull(),
  status: text("status").notNull().default("draft"),
  progress: integer("progress").notNull().default(0),
  stage: text("stage").notNull().default(""),
  error: text("error"),
  voice: text("voice").notNull().default("ava"),
  resolution: text("resolution").notNull().default("1080p"),
  aspect: text("aspect").notNull().default("16:9"),
  tone: text("tone").notNull().default("energetic"),
  style: text("style").notNull().default("modern"),
  language: text("language").notNull().default("en"),
  duration: integer("duration").notNull().default(30),
  script: jsonb("script").notNull().default(sql`'[]'::jsonb`),
  /** Optional brand kit applied to captions, logo bug and title cards. */
  brandKitId: uuid("brand_kit_id"),
  outputPath: text("output_path"),
  posterPath: text("poster_path"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const projectAssets = pgTable("project_assets", {
  key: text("key").primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  data: bytea("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Assets that are not tied to a single project — brand logos, AI-generated
 * imagery, cloned-voice reference samples. Same byte-range streaming contract
 * as `project_assets`, but with no project foreign key.
 */
export const appAssets = pgTable("app_assets", {
  key: text("key").primaryKey(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  data: bytea("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Brand kit — the InVideo-style "brand" applied across every render: logo bug,
 * palette, caption typeface and intro/outro title cards.
 */
export const brandKits = pgTable("brand_kits", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** Stored reference (relative storage key or absolute https URL). */
  logoPath: text("logo_path"),
  primaryColor: text("primary_color").notNull().default("#2563EB"),
  accentColor: text("accent_color").notNull().default("#FFFFFF"),
  font: text("font").notNull().default("DejaVu Sans"),
  introTitle: text("intro_title"),
  introSubtitle: text("intro_subtitle"),
  outroText: text("outro_text"),
  website: text("website"),
  showLogo: boolean("show_logo").notNull().default(true),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Cloned / custom voices. `providerVoiceId` is the upstream id returned by the
 * voice cloning API (e.g. an ElevenLabs voice id) and is what gets passed to
 * the TTS engine at render time.
 */
export const clonedVoices = pgTable("cloned_voices", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  provider: text("provider").notNull().default("elevenlabs"),
  providerVoiceId: text("provider_voice_id").notNull(),
  gender: text("gender").notNull().default("neutral"),
  accent: text("accent").notNull().default("Cloned"),
  description: text("description"),
  sampleCount: integer("sample_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ProjectRow = typeof projects.$inferSelect;
export type NewProjectRow = typeof projects.$inferInsert;
export type ProjectAssetRow = typeof projectAssets.$inferSelect;
export type BrandKitRow = typeof brandKits.$inferSelect;
export type ClonedVoiceRow = typeof clonedVoices.$inferSelect;

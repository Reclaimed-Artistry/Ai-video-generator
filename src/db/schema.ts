import { sql } from "drizzle-orm";
import {
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

export type ProjectRow = typeof projects.$inferSelect;
export type NewProjectRow = typeof projects.$inferInsert;
export type ProjectAssetRow = typeof projectAssets.$inferSelect;

import { sql } from "drizzle-orm";
import { boolean, date, index, integer, numeric, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { Period, Sport } from "../agenda-model.js";

export const events = pgTable("events", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  date: date("date", { mode: "string" }).notNull(),
  time: text("time").notNull(),
  meetingTime: text("meeting_time"),
  photographerLimit: integer("photographer_limit"),
  distancesKm: numeric("distances_km", { mode: "number" }).array().notNull().default(sql`'{}'::numeric[]`),
  published: boolean("published").notNull().default(false),
  hasBeenPublished: boolean("has_been_published").notNull().default(false),
  period: text("period").$type<Period>().notNull(),
  sport: text("sport").$type<Sport>().notNull(),
  location: text("location"),
  dateRevision: integer("date_revision").notNull().default(1),
}, (table) => [index("events_date_time").on(table.date, table.time)]);

export const responses = pgTable("responses", {
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  participantId: uuid("participant_id").notNull(),
  name: text("name").notNull(),
  available: boolean("available").notNull(),
  dateRevision: integer("date_revision").notNull().default(1),
}, (table) => [
  primaryKey({ columns: [table.eventId, table.participantId] }),
  index("responses_confirmed_by_event_date").on(table.eventId, table.dateRevision).where(sql`${table.available}`),
]);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const dashboardUsers = pgTable("dashboard_users", {
  id: uuid("id").primaryKey(),
  usernameKey: text("username_key").notNull().unique(),
  passwordSalt: text("password_salt").notNull(),
  passwordHash: text("password_hash").notNull(),
});

export const photographers = pgTable("photographers", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordSalt: text("password_salt").notNull(),
  passwordHash: text("password_hash").notNull(),
});

export const photographerSessions = pgTable("photographer_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  photographerId: uuid("photographer_id").notNull().references(() => photographers.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (table) => [index("photographer_sessions_account_expiry").on(table.photographerId, table.expiresAt)]);

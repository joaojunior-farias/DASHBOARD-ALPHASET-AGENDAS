import { sql } from "drizzle-orm";
import { type AnyPgColumn, boolean, date, index, integer, numeric, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { Period, Sport } from "../agenda-model.js";

export const calendarOptions = pgTable("calendar_options", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").$type<"category" | "modality" | "status" | "work_type">().notNull(),
  name: text("name").notNull(),
  code: text("code").unique(),
  parentId: uuid("parent_id").references((): AnyPgColumn => calendarOptions.id),
  color: text("color").$type<"gray" | "blue" | "orange" | "green" | "purple" | "red">(),
  cardSport: text("card_sport").$type<Sport>(),
});

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  version: integer("version").notNull().default(1),
}, (table) => [index("clients_name").on(sql`lower(${table.name})`)]);

export const calendarEvents = pgTable("calendar_events", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  clientName: text("client_name").notNull().default(""),
  clientId: uuid("client_id").references(() => clients.id),
  date: date("date", { mode: "string" }).notNull(),
  time: text("time").notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  endTime: text("end_time"),
  allDay: boolean("all_day").notNull().default(false),
  seriesId: uuid("series_id"),
  location: text("location").notNull().default(""),
  categoryId: uuid("category_id").notNull().references(() => calendarOptions.id),
  modalityId: uuid("modality_id").references(() => calendarOptions.id),
  statusId: uuid("status_id").notNull().references(() => calendarOptions.id),
  workTypeId: uuid("work_type_id").notNull().references(() => calendarOptions.id),
  distancesKm: numeric("distances_km", { mode: "number" }).array().notNull().default(sql`'{}'::numeric[]`),
  version: integer("version").notNull().default(1),
}, (table) => [index("calendar_events_date_time").on(table.date, table.time)]);

export const events = pgTable("events", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  date: date("date", { mode: "string" }).notNull(),
  time: text("time").notNull(),
  meetingTime: text("meeting_time"),
  distancesKm: numeric("distances_km", { mode: "number" }).array().notNull().default(sql`'{}'::numeric[]`),
  published: boolean("published").notNull().default(false),
  closed: boolean("closed").notNull().default(false),
  hasBeenPublished: boolean("has_been_published").notNull().default(false),
  period: text("period").$type<Period>().notNull(),
  sport: text("sport").$type<Sport>().notNull(),
  location: text("location"),
  dateRevision: integer("date_revision").notNull().default(1),
  calendarEventId: uuid("calendar_event_id").unique().references(() => calendarEvents.id),
}, (table) => [index("events_date_time").on(table.date, table.time)]);

export const responses = pgTable("responses", {
  id: uuid("id").notNull().unique().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  participantId: uuid("participant_id").notNull(),
  name: text("name").notNull(),
  available: boolean("available").notNull(),
  assignedByAdmin: boolean("assigned_by_admin").notNull().default(false),
  selection: text("selection").$type<"confirmed" | "declined">(),
  dateRevision: integer("date_revision").notNull().default(1),
}, (table) => [
  primaryKey({ columns: [table.eventId, table.participantId] }),
  index("responses_confirmed_by_event_date").on(table.eventId, table.dateRevision).where(sql`${table.available}`),
]);

export const manualPhotographerAssignments = pgTable("manual_photographer_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  dateRevision: integer("date_revision").notNull(),
  name: text("name").notNull(),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const dashboardUsers = pgTable("dashboard_users", {
  id: uuid("id").primaryKey(),
  usernameKey: text("username_key").notNull().unique(),
  passwordSalt: text("password_salt").notNull(),
  passwordHash: text("password_hash").notNull(),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  passwordVersion: integer("password_version").notNull().default(1),
});

export const dashboardProfiles = pgTable("dashboard_profiles", {
  subject: text("subject").primaryKey(),
  displayName: text("display_name").notNull(),
  avatar: text("avatar"),
});

export const photographers = pgTable("photographers", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordSalt: text("password_salt").notNull(),
  passwordHash: text("password_hash").notNull(),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
});

export const photographerSessions = pgTable("photographer_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  photographerId: uuid("photographer_id").notNull().references(() => photographers.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (table) => [index("photographer_sessions_account_expiry").on(table.photographerId, table.expiresAt)]);

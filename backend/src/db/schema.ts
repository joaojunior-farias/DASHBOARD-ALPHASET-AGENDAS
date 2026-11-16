import { boolean, date, index, integer, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import type { Period, Sport } from "../agenda-model.js";

export const events = pgTable("events", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  date: date("date", { mode: "string" }).notNull(),
  time: text("time").notNull(),
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
}, (table) => [primaryKey({ columns: [table.eventId, table.participantId] })]);

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

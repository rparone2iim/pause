// Pause — modèle de données (volontairement minimal : 5 tables)
import { sql } from "drizzle-orm";
import {
  pgTable, pgEnum, uuid, text, integer, doublePrecision, timestamp,
  index, uniqueIndex, primaryKey, check,
} from "drizzle-orm/pg-core";

import { SPOT_TYPES, TAGS } from "../lib/constants";

export const spotType = pgEnum("spot_type", SPOT_TYPES);
export const tag = pgEnum("tag", TAGS);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(), // UUID v4 : non devinable (≠ 1, 2, 3…)
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(), // bcrypt, jamais le mot de passe
  displayName: text("display_name").notNull(),
  preferredTypes: spotType("preferred_types").array().notNull().default(sql`'{}'`),
  radiusM: integer("radius_m").notNull().default(800),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const spots = pgTable("spots", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  accessTip: text("access_tip"),
  type: spotType("type").notNull(),
  tags: tag("tags").array().notNull().default(sql`'{}'`),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  authorId: uuid("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("spots_lat_lng_idx").on(t.lat, t.lng),
  check("spots_lat_ck", sql`${t.lat} BETWEEN -90 AND 90`),
  check("spots_lng_ck", sql`${t.lng} BETWEEN -180 AND 180`),
]);

export const photos = pgTable("photos", {
  id: uuid("id").primaryKey().defaultRandom(),
  filename: text("filename").notNull().unique(), // UUID aléatoire + .webp, jamais le nom envoyé
  spotId: uuid("spot_id").notNull().references(() => spots.id, { onDelete: "cascade" }),
  uploaderId: uuid("uploader_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reviews = pgTable("reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  spotId: uuid("spot_id").notNull().references(() => spots.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull(), // note globale
  calm: integer("calm").notNull(),
  clean: integer("clean").notNull(),
  seating: integer("seating").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("reviews_spot_author_uq").on(t.spotId, t.authorId), // 1 avis / personne / spot
  // Double sécurité : même si la validation Zod sautait, la BDD refuse une note hors 1-5
  check("reviews_notes_ck", sql`${t.rating} BETWEEN 1 AND 5 AND ${t.calm} BETWEEN 1 AND 5 AND ${t.clean} BETWEEN 1 AND 5 AND ${t.seating} BETWEEN 1 AND 5`),
]);

export const favorites = pgTable("favorites", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  spotId: uuid("spot_id").notNull().references(() => spots.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.spotId] })]);

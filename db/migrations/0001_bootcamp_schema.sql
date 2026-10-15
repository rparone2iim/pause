-- Passage au modèle de données de la nouvelle interface (lieux OpenStreetMap, filtres, tags avec icône,
-- spots privés, déconnexion côté serveur). Écrit à la main : les données existantes sont CONVERTIES, rien n'est perdu.
CREATE TABLE "revoked_tokens" (
	"jti" uuid PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_notes_ck";--> statement-breakpoint
ALTER TABLE "spots" DROP CONSTRAINT "spots_lat_ck";--> statement-breakpoint
ALTER TABLE "spots" DROP CONSTRAINT "spots_lng_ck";--> statement-breakpoint
DROP INDEX "reviews_spot_author_uq";--> statement-breakpoint

-- Avis : sous-notes facultatives, commentaire toujours présent (vide plutôt que NULL)
ALTER TABLE "reviews" ALTER COLUMN "calm" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ALTER COLUMN "clean" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ALTER COLUMN "seating" DROP NOT NULL;--> statement-breakpoint
UPDATE "reviews" SET "comment" = '' WHERE "comment" IS NULL;--> statement-breakpoint
ALTER TABLE "reviews" ALTER COLUMN "comment" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "reviews" ALTER COLUMN "comment" SET NOT NULL;--> statement-breakpoint

-- Spots : nouvelles colonnes, remplies à partir de l'ancien type et des anciens tags
ALTER TABLE "spots" ALTER COLUMN "description" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "spots" ALTER COLUMN "author_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "spots" ADD COLUMN "osm_ref" text;--> statement-breakpoint
ALTER TABLE "spots" ADD COLUMN "filters" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "spots" ADD COLUMN "quiet" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "spots" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "spots" ADD COLUMN "is_private" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "spots" SET
	"filters" = ARRAY(
		SELECT DISTINCT f FROM unnest(ARRAY[
			CASE "type"::text WHEN 'SMOKING' THEN 'smoke' WHEN 'CAFE' THEN 'coffee' WHEN 'BENCH' THEN 'quiet' WHEN 'SHELTER' THEN 'shelter' END,
			CASE WHEN 'ASHTRAY' = ANY("tags"::text[]) THEN 'smoke' END,
			CASE WHEN 'SHELTERED' = ANY("tags"::text[]) THEN 'shelter' END,
			CASE WHEN 'QUIET' = ANY("tags"::text[]) THEN 'quiet' END,
			CASE WHEN 'SHADE' = ANY("tags"::text[]) THEN 'shade' END
		]) AS f WHERE f IS NOT NULL
	),
	"quiet" = CASE
		WHEN 'QUIET' = ANY("tags"::text[]) THEN 4
		WHEN "type"::text = 'BENCH' THEN 4
		WHEN "type"::text = 'SHELTER' THEN 3
		ELSE 2
	END;--> statement-breakpoint
ALTER TABLE "spots" ALTER COLUMN "type" SET DATA TYPE text USING (
	CASE "type"::text WHEN 'SMOKING' THEN 'smoking' WHEN 'CAFE' THEN 'cafe' WHEN 'BENCH' THEN 'bench' WHEN 'SHELTER' THEN 'shelter' END
);--> statement-breakpoint
ALTER TABLE "spots" ALTER COLUMN "tags" DROP DEFAULT;--> statement-breakpoint
CREATE FUNCTION "pause_mig_tags"(old text[]) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
	SELECT coalesce(jsonb_agg(jsonb_build_object('icon', m.icon, 'label', m.label) ORDER BY t.n), '[]'::jsonb)
	FROM unnest(old) WITH ORDINALITY AS t(tag, n)
	JOIN (VALUES
		('ASHTRAY', 'smoking_rooms', 'Cendrier'),
		('SHELTERED', 'umbrella', 'Couvert'),
		('SEATING', 'chair', 'Places assises'),
		('SHADE', 'wb_shade', 'À l''ombre'),
		('SUN', 'wb_sunny', 'Au soleil'),
		('QUIET', 'volume_off', 'Calme'),
		('TAKEAWAY', 'takeout_dining', 'À emporter')
	) AS m(tag, icon, label) ON m.tag = t.tag
$$;--> statement-breakpoint
ALTER TABLE "spots" ALTER COLUMN "tags" SET DATA TYPE jsonb USING "pause_mig_tags"("tags"::text[]);--> statement-breakpoint
DROP FUNCTION "pause_mig_tags"(text[]);--> statement-breakpoint
ALTER TABLE "spots" ALTER COLUMN "tags" SET DEFAULT '[]'::jsonb;--> statement-breakpoint

-- Utilisateurs : préférences en filtres, rayon borné à 300 m – 3 km
ALTER TABLE "users" ALTER COLUMN "preferred_types" DROP DEFAULT;--> statement-breakpoint
CREATE FUNCTION "pause_mig_prefs"(old text[]) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
	SELECT coalesce(array_agg(DISTINCT CASE p WHEN 'SMOKING' THEN 'smoke' WHEN 'CAFE' THEN 'coffee' WHEN 'BENCH' THEN 'quiet' WHEN 'SHELTER' THEN 'shelter' END), ARRAY[]::text[])
	FROM unnest(old) AS p
$$;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "preferred_types" SET DATA TYPE text[] USING "pause_mig_prefs"("preferred_types"::text[]);--> statement-breakpoint
DROP FUNCTION "pause_mig_prefs"(text[]);--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "preferred_types" SET DEFAULT ARRAY['smoke', 'coffee']::text[];--> statement-breakpoint
UPDATE "users" SET "radius_m" = LEAST(GREATEST("radius_m", 300), 3000);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint

CREATE INDEX "photos_spot_idx" ON "photos" USING btree ("spot_id","created_at");--> statement-breakpoint
CREATE INDEX "reviews_spot_idx" ON "reviews" USING btree ("spot_id","updated_at");--> statement-breakpoint
CREATE INDEX "spots_author_idx" ON "spots" USING btree ("author_id");--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_spot_author_unique" UNIQUE("spot_id","author_id");--> statement-breakpoint
ALTER TABLE "spots" ADD CONSTRAINT "spots_osm_ref_unique" UNIQUE("osm_ref");--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_filename_format" CHECK ("photos"."filename" ~ '^[0-9a-f-]{36}\.webp$');--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating_range" CHECK ("reviews"."rating" BETWEEN 1 AND 5);--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_calm_range" CHECK ("reviews"."calm" IS NULL OR "reviews"."calm" BETWEEN 1 AND 5);--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_clean_range" CHECK ("reviews"."clean" IS NULL OR "reviews"."clean" BETWEEN 1 AND 5);--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_seating_range" CHECK ("reviews"."seating" IS NULL OR "reviews"."seating" BETWEEN 1 AND 5);--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_comment_length" CHECK (char_length("reviews"."comment") <= 500);--> statement-breakpoint
ALTER TABLE "spots" ADD CONSTRAINT "spots_lat_range" CHECK ("spots"."lat" BETWEEN -90 AND 90);--> statement-breakpoint
ALTER TABLE "spots" ADD CONSTRAINT "spots_lng_range" CHECK ("spots"."lng" BETWEEN -180 AND 180);--> statement-breakpoint
ALTER TABLE "spots" ADD CONSTRAINT "spots_type_valid" CHECK ("spots"."type" IN ('cafe', 'bar', 'terrace', 'park', 'bench', 'smoking', 'shelter'));--> statement-breakpoint
ALTER TABLE "spots" ADD CONSTRAINT "spots_filters_valid" CHECK ("spots"."filters" <@ ARRAY['smoke', 'coffee', 'quiet', 'shade', 'shelter']::text[]);--> statement-breakpoint
ALTER TABLE "spots" ADD CONSTRAINT "spots_quiet_range" CHECK ("spots"."quiet" BETWEEN 1 AND 5);--> statement-breakpoint
ALTER TABLE "spots" ADD CONSTRAINT "spots_name_length" CHECK (char_length("spots"."name") BETWEEN 1 AND 120);--> statement-breakpoint
ALTER TABLE "spots" ADD CONSTRAINT "spots_author_xor_osm" CHECK (("spots"."author_id" IS NULL) <> ("spots"."osm_ref" IS NULL));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_lowercase" CHECK ("users"."email" = lower("users"."email"));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_display_name_length" CHECK (char_length("users"."display_name") BETWEEN 2 AND 40);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_radius_m_range" CHECK ("users"."radius_m" BETWEEN 300 AND 3000);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_preferred_types_valid" CHECK ("users"."preferred_types" <@ ARRAY['smoke', 'coffee', 'quiet', 'shade', 'shelter']::text[]);--> statement-breakpoint
DROP TYPE "public"."spot_type";--> statement-breakpoint
DROP TYPE "public"."tag";

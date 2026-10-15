-- Retour arrière de 0001 : revient à l'ancien modèle (enums, tags en tableau, sous-notes obligatoires).
-- Perte assumée de ce que l'ancien modèle ne sait pas représenter : lieux OpenStreetMap / Google (sans auteur)
-- et leurs avis/photos/favoris, filtres, calme, adresse, spots privés. Les types bar/terrasse deviennent CAFE,
-- parc devient BENCH, les tags inconnus de l'ancienne liste disparaissent.

ALTER TABLE "users" DROP CONSTRAINT "users_preferred_types_valid";
ALTER TABLE "users" DROP CONSTRAINT "users_radius_m_range";
ALTER TABLE "users" DROP CONSTRAINT "users_display_name_length";
ALTER TABLE "users" DROP CONSTRAINT "users_email_lowercase";
ALTER TABLE "spots" DROP CONSTRAINT "spots_author_xor_osm";
ALTER TABLE "spots" DROP CONSTRAINT "spots_name_length";
ALTER TABLE "spots" DROP CONSTRAINT "spots_quiet_range";
ALTER TABLE "spots" DROP CONSTRAINT "spots_filters_valid";
ALTER TABLE "spots" DROP CONSTRAINT "spots_type_valid";
ALTER TABLE "spots" DROP CONSTRAINT "spots_lng_range";
ALTER TABLE "spots" DROP CONSTRAINT "spots_lat_range";
ALTER TABLE "spots" DROP CONSTRAINT "spots_osm_ref_unique";
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_comment_length";
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_seating_range";
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_clean_range";
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_calm_range";
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_rating_range";
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_spot_author_unique";
ALTER TABLE "photos" DROP CONSTRAINT "photos_filename_format";
DROP INDEX "spots_author_idx";
DROP INDEX "reviews_spot_idx";
DROP INDEX "photos_spot_idx";

CREATE TYPE "public"."spot_type" AS ENUM('SMOKING', 'CAFE', 'BENCH', 'SHELTER');
CREATE TYPE "public"."tag" AS ENUM('ASHTRAY', 'SHELTERED', 'SEATING', 'SHADE', 'SUN', 'QUIET', 'TAKEAWAY');

-- Utilisateurs : préférences en anciens types
ALTER TABLE "users" DROP COLUMN "updated_at";
ALTER TABLE "users" ALTER COLUMN "preferred_types" DROP DEFAULT;
CREATE FUNCTION "pause_down_prefs"(cur text[]) RETURNS "spot_type"[] LANGUAGE sql IMMUTABLE AS $$
	SELECT coalesce(array_agg(DISTINCT m.old::"spot_type"), ARRAY[]::"spot_type"[])
	FROM unnest(cur) AS p
	JOIN (VALUES ('smoke', 'SMOKING'), ('coffee', 'CAFE'), ('quiet', 'BENCH'), ('shelter', 'SHELTER')) AS m(cur, old) ON m.cur = p
$$;
ALTER TABLE "users" ALTER COLUMN "preferred_types" SET DATA TYPE "spot_type"[] USING "pause_down_prefs"("preferred_types");
DROP FUNCTION "pause_down_prefs"(text[]);
ALTER TABLE "users" ALTER COLUMN "preferred_types" SET DEFAULT '{}';

-- Spots : les lieux externes n'existaient pas (leurs avis, photos et favoris partent en cascade)
DELETE FROM "spots" WHERE "author_id" IS NULL;
ALTER TABLE "spots" ALTER COLUMN "tags" DROP DEFAULT;
CREATE FUNCTION "pause_down_tags"(cur jsonb) RETURNS "tag"[] LANGUAGE sql IMMUTABLE AS $$
	SELECT coalesce(array_agg(m.tag::"tag" ORDER BY t.n), ARRAY[]::"tag"[])
	FROM jsonb_array_elements(cur) WITH ORDINALITY AS t(item, n)
	JOIN (VALUES
		('Cendrier', 'ASHTRAY'),
		('Couvert', 'SHELTERED'),
		('Places assises', 'SEATING'),
		('À l''ombre', 'SHADE'),
		('Au soleil', 'SUN'),
		('Calme', 'QUIET'),
		('À emporter', 'TAKEAWAY')
	) AS m(label, tag) ON m.label = t.item->>'label'
$$;
ALTER TABLE "spots" ALTER COLUMN "tags" SET DATA TYPE "tag"[] USING "pause_down_tags"("tags");
DROP FUNCTION "pause_down_tags"(jsonb);
ALTER TABLE "spots" ALTER COLUMN "tags" SET DEFAULT '{}';
ALTER TABLE "spots" ALTER COLUMN "type" SET DATA TYPE "spot_type" USING (
	CASE "type" WHEN 'smoking' THEN 'SMOKING' WHEN 'cafe' THEN 'CAFE' WHEN 'bar' THEN 'CAFE' WHEN 'terrace' THEN 'CAFE'
		WHEN 'bench' THEN 'BENCH' WHEN 'park' THEN 'BENCH' WHEN 'shelter' THEN 'SHELTER' END
)::"spot_type";
ALTER TABLE "spots" DROP COLUMN "is_private";
ALTER TABLE "spots" DROP COLUMN "address";
ALTER TABLE "spots" DROP COLUMN "quiet";
ALTER TABLE "spots" DROP COLUMN "filters";
ALTER TABLE "spots" DROP COLUMN "osm_ref";
ALTER TABLE "spots" ALTER COLUMN "author_id" SET NOT NULL;
UPDATE "spots" SET "description" = '' WHERE "description" IS NULL;
ALTER TABLE "spots" ALTER COLUMN "description" SET NOT NULL;

-- Avis : sous-notes de nouveau obligatoires (une sous-note absente prend la note globale)
ALTER TABLE "reviews" ALTER COLUMN "comment" DROP NOT NULL;
ALTER TABLE "reviews" ALTER COLUMN "comment" DROP DEFAULT;
UPDATE "reviews" SET "calm" = coalesce("calm", "rating"), "clean" = coalesce("clean", "rating"), "seating" = coalesce("seating", "rating");
ALTER TABLE "reviews" ALTER COLUMN "calm" SET NOT NULL;
ALTER TABLE "reviews" ALTER COLUMN "clean" SET NOT NULL;
ALTER TABLE "reviews" ALTER COLUMN "seating" SET NOT NULL;

CREATE UNIQUE INDEX "reviews_spot_author_uq" ON "reviews" USING btree ("spot_id","author_id");
ALTER TABLE "spots" ADD CONSTRAINT "spots_lng_ck" CHECK ("spots"."lng" BETWEEN -180 AND 180);
ALTER TABLE "spots" ADD CONSTRAINT "spots_lat_ck" CHECK ("spots"."lat" BETWEEN -90 AND 90);
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_notes_ck" CHECK ("reviews"."rating" BETWEEN 1 AND 5 AND "reviews"."calm" BETWEEN 1 AND 5 AND "reviews"."clean" BETWEEN 1 AND 5 AND "reviews"."seating" BETWEEN 1 AND 5);
DROP TABLE "revoked_tokens";

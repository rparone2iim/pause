CREATE TYPE "public"."spot_type" AS ENUM('SMOKING', 'CAFE', 'BENCH', 'SHELTER');--> statement-breakpoint
CREATE TYPE "public"."tag" AS ENUM('ASHTRAY', 'SHELTERED', 'SEATING', 'SHADE', 'SUN', 'QUIET', 'TAKEAWAY');--> statement-breakpoint
CREATE TABLE "favorites" (
	"user_id" uuid NOT NULL,
	"spot_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorites_user_id_spot_id_pk" PRIMARY KEY("user_id","spot_id")
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"filename" text NOT NULL,
	"spot_id" uuid NOT NULL,
	"uploader_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "photos_filename_unique" UNIQUE("filename")
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"spot_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"calm" integer NOT NULL,
	"clean" integer NOT NULL,
	"seating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_notes_ck" CHECK ("reviews"."rating" BETWEEN 1 AND 5 AND "reviews"."calm" BETWEEN 1 AND 5 AND "reviews"."clean" BETWEEN 1 AND 5 AND "reviews"."seating" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "spots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"access_tip" text,
	"type" "spot_type" NOT NULL,
	"tags" "tag"[] DEFAULT '{}' NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"author_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spots_lat_ck" CHECK ("spots"."lat" BETWEEN -90 AND 90),
	CONSTRAINT "spots_lng_ck" CHECK ("spots"."lng" BETWEEN -180 AND 180)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"preferred_types" "spot_type"[] DEFAULT '{}' NOT NULL,
	"radius_m" integer DEFAULT 800 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_spot_id_spots_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_spot_id_spots_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_uploader_id_users_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_spot_id_spots_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spots" ADD CONSTRAINT "spots_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_spot_author_uq" ON "reviews" USING btree ("spot_id","author_id");--> statement-breakpoint
CREATE INDEX "spots_lat_lng_idx" ON "spots" USING btree ("lat","lng");
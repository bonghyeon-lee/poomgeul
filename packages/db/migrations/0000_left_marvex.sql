CREATE TYPE "public"."collaborator_role" AS ENUM('lead', 'collaborator');--> statement-breakpoint
CREATE TYPE "public"."contribution_event" AS ENUM('segment_edit', 'proposal_submit', 'proposal_merge', 'review_comment');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."license" AS ENUM('CC-BY', 'CC-BY-SA', 'PD', 'CC-BY-NC');--> statement-breakpoint
CREATE TYPE "public"."maintainer_policy" AS ENUM('author-registered', 'community-curated');--> statement-breakpoint
CREATE TYPE "public"."proposal_status" AS ENUM('open', 'merged', 'rejected', 'withdrawn', 'stale');--> statement-breakpoint
CREATE TYPE "public"."segment_kind" AS ENUM('body', 'caption', 'footnote', 'reference');--> statement-breakpoint
CREATE TYPE "public"."translation_segment_status" AS ENUM('unreviewed', 'approved');--> statement-breakpoint
CREATE TYPE "public"."translation_status" AS ENUM('draft', 'reviewed', 'featured');--> statement-breakpoint
CREATE TYPE "public"."user_tier" AS ENUM('new', 'verified', 'maintainer', 'curator');--> statement-breakpoint
CREATE TABLE "alignments" (
	"source_segment_id" uuid NOT NULL,
	"translation_id" uuid NOT NULL,
	"translation_segment_id" uuid NOT NULL,
	CONSTRAINT "alignments_source_segment_id_translation_id_translation_segment_id_pk" PRIMARY KEY("source_segment_id","translation_id","translation_segment_id")
);
--> statement-breakpoint
CREATE TABLE "contributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"event_type" "contribution_event" NOT NULL,
	"entity_ref" jsonb NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "glossary_entries" (
	"entry_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid,
	"term" text NOT NULL,
	"translation" text NOT NULL,
	"definition" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"note_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"translation_id" uuid NOT NULL,
	"segment_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposal_comments" (
	"comment_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"proposal_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"translation_id" uuid NOT NULL,
	"segment_id" uuid NOT NULL,
	"base_segment_version" integer NOT NULL,
	"proposed_text" text NOT NULL,
	"reason" text,
	"proposer_id" uuid NOT NULL,
	"status" "proposal_status" DEFAULT 'open' NOT NULL,
	"resolved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "segments" (
	"segment_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"order" integer NOT NULL,
	"original_text" text NOT NULL,
	"kind" "segment_kind" DEFAULT 'body' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"source_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"author" text[] NOT NULL,
	"original_lang" varchar(8) NOT NULL,
	"license" "license" NOT NULL,
	"attribution_source" text NOT NULL,
	"source_version" text NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"imported_by" uuid NOT NULL,
	"maintainer_policy" "maintainer_policy"
);
--> statement-breakpoint
CREATE TABLE "tm_units" (
	"unit_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_text" text NOT NULL,
	"target_text" text NOT NULL,
	"embedding" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "translation_collaborators" (
	"translation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "collaborator_role" NOT NULL,
	"invited_by" uuid,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "translation_collaborators_translation_id_user_id_pk" PRIMARY KEY("translation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "translation_invitations" (
	"invitation_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"translation_id" uuid NOT NULL,
	"invited_email" text NOT NULL,
	"invited_by" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	CONSTRAINT "translation_invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "translation_revisions" (
	"revision_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"translation_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"commit_message" text,
	"merged_proposal_id" uuid,
	"snapshot" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "translation_segments" (
	"translation_id" uuid NOT NULL,
	"segment_id" uuid NOT NULL,
	"text" text NOT NULL,
	"ai_draft_text" text,
	"ai_draft_source" jsonb,
	"version" integer DEFAULT 0 NOT NULL,
	"last_editor_id" uuid,
	"last_edited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "translation_segment_status" DEFAULT 'unreviewed' NOT NULL,
	CONSTRAINT "translation_segments_translation_id_segment_id_pk" PRIMARY KEY("translation_id","segment_id")
);
--> statement-breakpoint
CREATE TABLE "translations" (
	"translation_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"target_lang" varchar(8) NOT NULL,
	"lead_id" uuid NOT NULL,
	"status" "translation_status" DEFAULT 'draft' NOT NULL,
	"license" "license" NOT NULL,
	"current_revision_id" uuid,
	"forked_from_id" uuid,
	"slug" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"github_handle" text,
	"orcid" text,
	"tier" "user_tier" DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "alignments" ADD CONSTRAINT "alignments_source_segment_id_segments_segment_id_fk" FOREIGN KEY ("source_segment_id") REFERENCES "public"."segments"("segment_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alignments" ADD CONSTRAINT "alignments_translation_id_translations_translation_id_fk" FOREIGN KEY ("translation_id") REFERENCES "public"."translations"("translation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glossary_entries" ADD CONSTRAINT "glossary_entries_source_id_sources_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("source_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_translation_id_translations_translation_id_fk" FOREIGN KEY ("translation_id") REFERENCES "public"."translations"("translation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_segment_id_segments_segment_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."segments"("segment_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_comments" ADD CONSTRAINT "proposal_comments_proposal_id_proposals_proposal_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("proposal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_comments" ADD CONSTRAINT "proposal_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_translation_id_translations_translation_id_fk" FOREIGN KEY ("translation_id") REFERENCES "public"."translations"("translation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_segment_id_segments_segment_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."segments"("segment_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_proposer_id_users_id_fk" FOREIGN KEY ("proposer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segments" ADD CONSTRAINT "segments_source_id_sources_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("source_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_imported_by_users_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_collaborators" ADD CONSTRAINT "translation_collaborators_translation_id_translations_translation_id_fk" FOREIGN KEY ("translation_id") REFERENCES "public"."translations"("translation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_collaborators" ADD CONSTRAINT "translation_collaborators_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_collaborators" ADD CONSTRAINT "translation_collaborators_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_invitations" ADD CONSTRAINT "translation_invitations_translation_id_translations_translation_id_fk" FOREIGN KEY ("translation_id") REFERENCES "public"."translations"("translation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_invitations" ADD CONSTRAINT "translation_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_revisions" ADD CONSTRAINT "translation_revisions_translation_id_translations_translation_id_fk" FOREIGN KEY ("translation_id") REFERENCES "public"."translations"("translation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_revisions" ADD CONSTRAINT "translation_revisions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_segments" ADD CONSTRAINT "translation_segments_translation_id_translations_translation_id_fk" FOREIGN KEY ("translation_id") REFERENCES "public"."translations"("translation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_segments" ADD CONSTRAINT "translation_segments_segment_id_segments_segment_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."segments"("segment_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_segments" ADD CONSTRAINT "translation_segments_last_editor_id_users_id_fk" FOREIGN KEY ("last_editor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translations" ADD CONSTRAINT "translations_source_id_sources_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("source_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translations" ADD CONSTRAINT "translations_lead_id_users_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translations" ADD CONSTRAINT "translations_forked_from_id_translations_translation_id_fk" FOREIGN KEY ("forked_from_id") REFERENCES "public"."translations"("translation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "segments_source_order_uq" ON "segments" USING btree ("source_id","order");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_attribution_version_uq" ON "sources" USING btree ("attribution_source","source_version");--> statement-breakpoint
CREATE UNIQUE INDEX "translations_source_lang_slug_uq" ON "translations" USING btree ("source_id","target_lang","slug");
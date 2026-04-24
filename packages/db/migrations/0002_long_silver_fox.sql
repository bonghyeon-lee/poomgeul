CREATE TABLE "proposal_blocklist" (
	"translation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"blocked_by" uuid NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	CONSTRAINT "proposal_blocklist_translation_id_user_id_pk" PRIMARY KEY("translation_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "proposal_blocklist" ADD CONSTRAINT "proposal_blocklist_translation_id_translations_translation_id_fk" FOREIGN KEY ("translation_id") REFERENCES "public"."translations"("translation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_blocklist" ADD CONSTRAINT "proposal_blocklist_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_blocklist" ADD CONSTRAINT "proposal_blocklist_blocked_by_users_id_fk" FOREIGN KEY ("blocked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_blocklist" ADD CONSTRAINT "proposal_blocklist_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "proposal_blocklist_active_idx" ON "proposal_blocklist" USING btree ("translation_id","user_id") WHERE "proposal_blocklist"."revoked_at" is null;
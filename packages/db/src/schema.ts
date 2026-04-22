/**
 * poomgeul database schema.
 *
 * Source of truth: docs/architecture/data-model.md.
 *
 * Activation tags:
 *   [M0]                    — rows populate and logic runs in M0.
 *   pre-design [M0] / [M1]  — table exists from M0 but only populated/used starting M1.
 *   [M2]                    — shipped in M2 (e.g. glossary, TM, inline comment anchors).
 *
 * pgvector columns are declared but not yet exercised (M2 TM scope).
 */

import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// ---------- Enums ----------

export const licenseEnum = pgEnum("license", [
  "CC-BY",
  "CC-BY-SA",
  "PD",
  "CC-BY-NC", // admitted case-by-case; registration path gated
]);

export const maintainerPolicyEnum = pgEnum("maintainer_policy", [
  "author-registered",
  "community-curated",
]);

export const segmentKindEnum = pgEnum("segment_kind", ["body", "caption", "footnote", "reference"]);

export const translationStatusEnum = pgEnum("translation_status", [
  "draft",
  "reviewed",
  "featured",
]);

export const translationSegmentStatusEnum = pgEnum("translation_segment_status", [
  "unreviewed",
  "approved",
]);

export const collaboratorRoleEnum = pgEnum("collaborator_role", ["lead", "collaborator"]);

export const invitationStatusEnum = pgEnum("invitation_status", [
  "pending",
  "accepted",
  "revoked",
  "expired",
]);

export const proposalStatusEnum = pgEnum("proposal_status", [
  "open",
  "merged",
  "rejected",
  "withdrawn",
  "stale",
]);

export const userTierEnum = pgEnum("user_tier", [
  "new", // M0 default for all users
  "verified", // M2
  "maintainer", // M1 manual / M2 auto
  "curator", // core team
]);

export const contributionEventEnum = pgEnum("contribution_event", [
  "segment_edit",
  "proposal_submit",
  "proposal_merge",
  "review_comment",
]);

// ---------- User [M0] ----------

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  githubHandle: text("github_handle"),
  orcid: text("orcid"), // M1+ linkage
  tier: userTierEnum("tier").notNull().default("new"), // M0: all rows stay 'new'
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Source (원문) [M0] ----------

export const sources = pgTable(
  "sources",
  {
    sourceId: uuid("source_id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    author: text("author").array().notNull(),
    originalLang: varchar("original_lang", { length: 8 }).notNull(),
    license: licenseEnum("license").notNull(),
    attributionSource: text("attribution_source").notNull(),
    sourceVersion: text("source_version").notNull(),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
    importedBy: uuid("imported_by")
      .notNull()
      .references(() => users.id),
    maintainerPolicy: maintainerPolicyEnum("maintainer_policy"),
  },
  (t) => ({
    attributionUnique: uniqueIndex("sources_attribution_version_uq").on(
      t.attributionSource,
      t.sourceVersion,
    ),
  }),
);

// ---------- Segment [M0] ----------

export const segments = pgTable(
  "segments",
  {
    segmentId: uuid("segment_id").defaultRandom().primaryKey(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.sourceId, { onDelete: "cascade" }),
    order: integer("order").notNull(),
    originalText: text("original_text").notNull(),
    kind: segmentKindEnum("kind").notNull().default("body"),
  },
  (t) => ({
    sourceOrderUnique: uniqueIndex("segments_source_order_uq").on(t.sourceId, t.order),
  }),
);

// ---------- Translation [M0] (multi-translation activates M1) ----------

export const translations = pgTable(
  "translations",
  {
    translationId: uuid("translation_id").defaultRandom().primaryKey(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.sourceId, { onDelete: "cascade" }),
    targetLang: varchar("target_lang", { length: 8 }).notNull(), // 'ko' fixed in M0
    leadId: uuid("lead_id")
      .notNull()
      .references(() => users.id),
    status: translationStatusEnum("status").notNull().default("draft"),
    license: licenseEnum("license").notNull(),
    currentRevisionId: uuid("current_revision_id"), // FK added after translationRevisions
    // pre-design [M0] / active [M2+] — always NULL until fork is allowed
    forkedFromId: uuid("forked_from_id").references((): AnyPgColumn => translations.translationId),
    slug: text("slug").notNull(),
  },
  (t) => ({
    sourceLangSlugUnique: uniqueIndex("translations_source_lang_slug_uq").on(
      t.sourceId,
      t.targetLang,
      t.slug,
    ),
  }),
);

// ---------- TranslationCollaborator [pre-design M0 / active M1] ----------

export const translationCollaborators = pgTable(
  "translation_collaborators",
  {
    translationId: uuid("translation_id")
      .notNull()
      .references(() => translations.translationId, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: collaboratorRoleEnum("role").notNull(), // M0 writes only 'lead'
    invitedBy: uuid("invited_by").references(() => users.id),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.translationId, t.userId] }),
  }),
);

// ---------- TranslationInvitation [M1] ----------

export const translationInvitations = pgTable("translation_invitations", {
  invitationId: uuid("invitation_id").defaultRandom().primaryKey(),
  translationId: uuid("translation_id")
    .notNull()
    .references(() => translations.translationId, { onDelete: "cascade" }),
  invitedEmail: text("invited_email").notNull(),
  invitedBy: uuid("invited_by")
    .notNull()
    .references(() => users.id),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  status: invitationStatusEnum("status").notNull().default("pending"),
});

// ---------- TranslationSegment [M0] ----------

export const translationSegments = pgTable(
  "translation_segments",
  {
    translationId: uuid("translation_id")
      .notNull()
      .references(() => translations.translationId, { onDelete: "cascade" }),
    segmentId: uuid("segment_id")
      .notNull()
      .references(() => segments.segmentId, { onDelete: "cascade" }),
    text: text("text").notNull(),
    aiDraftText: text("ai_draft_text"),
    // { model, prompt_hash, prompt_version, tier, generated_at }
    aiDraftSource: jsonb("ai_draft_source"),
    version: integer("version").notNull().default(0), // optimistic locking (ADR-0003)
    lastEditorId: uuid("last_editor_id").references(() => users.id),
    lastEditedAt: timestamp("last_edited_at", { withTimezone: true }).notNull().defaultNow(),
    status: translationSegmentStatusEnum("status").notNull().default("unreviewed"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.translationId, t.segmentId] }),
  }),
);

// ---------- TranslationRevision [M0] ----------

export const translationRevisions = pgTable("translation_revisions", {
  revisionId: uuid("revision_id").defaultRandom().primaryKey(),
  translationId: uuid("translation_id")
    .notNull()
    .references(() => translations.translationId, { onDelete: "cascade" }),
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  commitMessage: text("commit_message"),
  mergedProposalId: uuid("merged_proposal_id"), // FK added after proposals (forward-declared)
  snapshot: jsonb("snapshot").notNull(), // translation-level snapshot; per-segment blame deferred to M2
});

// ---------- Proposal [M0] ----------

export const proposals = pgTable("proposals", {
  proposalId: uuid("proposal_id").defaultRandom().primaryKey(),
  translationId: uuid("translation_id")
    .notNull()
    .references(() => translations.translationId, { onDelete: "cascade" }),
  segmentId: uuid("segment_id")
    .notNull()
    .references(() => segments.segmentId, { onDelete: "cascade" }),
  baseSegmentVersion: integer("base_segment_version").notNull(),
  proposedText: text("proposed_text").notNull(),
  reason: text("reason"),
  proposerId: uuid("proposer_id")
    .notNull()
    .references(() => users.id),
  status: proposalStatusEnum("status").notNull().default("open"),
  resolvedBy: uuid("resolved_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

// ---------- ProposalComment [M0] (inline anchor deferred to M2) ----------

export const proposalComments = pgTable("proposal_comments", {
  commentId: uuid("comment_id").defaultRandom().primaryKey(),
  proposalId: uuid("proposal_id")
    .notNull()
    .references(() => proposals.proposalId, { onDelete: "cascade" }),
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // M2: add start/end anchor offsets to highlight a sub-range
  // anchorStart: integer("anchor_start"),
  // anchorEnd: integer("anchor_end"),
});

// ---------- Contribution [M0] ----------

export const contributions = pgTable("contributions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  eventType: contributionEventEnum("event_type").notNull(),
  // { translationId, segmentId, proposalId, ... }
  entityRef: jsonb("entity_ref").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Metadata (M2) — schema pre-design only ----------

// Notes are pre-designed in M0 (storage + basic display); glossary/TM/alignment are M2.

export const notes = pgTable("notes", {
  noteId: uuid("note_id").defaultRandom().primaryKey(),
  translationId: uuid("translation_id")
    .notNull()
    .references(() => translations.translationId, { onDelete: "cascade" }),
  segmentId: uuid("segment_id")
    .notNull()
    .references(() => segments.segmentId, { onDelete: "cascade" }),
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const glossaryEntries = pgTable("glossary_entries", {
  entryId: uuid("entry_id").defaultRandom().primaryKey(),
  // scoped either to a single source (source_id) or a project (project_id, M2).
  sourceId: uuid("source_id").references(() => sources.sourceId, {
    onDelete: "cascade",
  }),
  term: text("term").notNull(),
  translation: text("translation").notNull(),
  definition: text("definition"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * TMUnit [M2] — pgvector column is pre-designed as raw SQL to avoid pulling the
 * drizzle vector helper before M2. We treat the column as bytea-compatible text
 * for now; actual KNN index + operator class are added in the M2 migration.
 */
export const tmUnits = pgTable("tm_units", {
  unitId: uuid("unit_id").defaultRandom().primaryKey(),
  sourceText: text("source_text").notNull(),
  targetText: text("target_text").notNull(),
  // placeholder: pgvector column + ivfflat index will be added in M2 migration.
  embedding: text("embedding"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const alignments = pgTable(
  "alignments",
  {
    sourceSegmentId: uuid("source_segment_id")
      .notNull()
      .references(() => segments.segmentId, { onDelete: "cascade" }),
    // alignment targets a translationSegment's (translation_id, segment_id) composite;
    // M0 schema keeps loose references — active use begins in M2.
    translationId: uuid("translation_id")
      .notNull()
      .references(() => translations.translationId, { onDelete: "cascade" }),
    translationSegmentId: uuid("translation_segment_id").notNull(),
  },
  (t) => ({
    pk: primaryKey({
      columns: [t.sourceSegmentId, t.translationId, t.translationSegmentId],
    }),
  }),
);

// ---------- Exported schema (barrel for drizzle client) ----------

export const schema = {
  users,
  sources,
  segments,
  translations,
  translationCollaborators,
  translationInvitations,
  translationSegments,
  translationRevisions,
  proposals,
  proposalComments,
  contributions,
  notes,
  glossaryEntries,
  tmUnits,
  alignments,
};

export type Schema = typeof schema;

// Inferred row types (example — extend as domain layer requires):
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Source = typeof sources.$inferSelect;
export type Segment = typeof segments.$inferSelect;
export type Translation = typeof translations.$inferSelect;
export type TranslationSegment = typeof translationSegments.$inferSelect;
export type Proposal = typeof proposals.$inferSelect;
export type NewProposal = typeof proposals.$inferInsert;

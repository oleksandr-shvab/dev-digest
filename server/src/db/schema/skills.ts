import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  primaryKey,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';

export const skills = pgTable(
  'skills',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    /** kebab-case slug, unique per workspace. */
    name: text('name').notNull(),
    description: text('description').notNull(),
    type: text('type', { enum: ['rubric', 'convention', 'security', 'custom'] }).notNull(),
    source: text('source', {
      enum: ['manual', 'imported_url', 'imported_file', 'extracted', 'community'],
    }).notNull(),
    body: text('body').notNull(),
    /** Global kill-switch; a skill reaches a prompt only when this AND agent_skills.enabled. */
    enabled: boolean('enabled').notNull().default(true),
    version: integer('version').notNull().default(1),
    evidenceFiles: jsonb('evidence_files').$type<string[]>(),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ workspaceNameUnique: unique('skills_workspace_id_name_unique').on(t.workspaceId, t.name) }),
);

export const skillVersions = pgTable(
  'skill_versions',
  {
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    body: text('body').notNull(),
    // Snapshot of every prompt-affecting field (Decision 6) + the save message.
    description: text('description').notNull().default(''),
    type: text('type', { enum: ['rubric', 'convention', 'security', 'custom'] })
      .notNull()
      .default('custom'),
    message: text('message').notNull().default(''),
    createdAt: now(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.skillId, t.version] }) }),
);

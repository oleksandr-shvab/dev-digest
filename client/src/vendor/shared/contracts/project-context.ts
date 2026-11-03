import { z } from 'zod';

/**
 * Project context — Markdown docs of a repo (read from the synced default-branch
 * mirror) that a repo owner attaches by path to an agent or a skill. The server
 * reads them at run time and adds them to the prompt as untrusted data.
 */

/** Technical sanity cap on one attachment list (not a product limit). */
export const MAX_ATTACHED_DOCS = 200;

export const ProjectContextDocType = z.enum(['specs', 'docs', 'insights']);
export type ProjectContextDocType = z.infer<typeof ProjectContextDocType>;

export const ProjectContextDocStatus = z.enum(['included', 'missing', 'skipped_budget']);
export type ProjectContextDocStatus = z.infer<typeof ProjectContextDocStatus>;

const MAX_ATTACHMENT_PATH_CHARS = 512;
const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/;
const FORBIDDEN_SEGMENTS = new Set(['', '.', '..', '.git', 'node_modules']);

/**
 * The single definition of a valid attached path: repo-relative, a `.md` file, no
 * leading `/`, no backslash, no NUL or control character, no empty/`.`/`..`
 * segment, no `.git` or `node_modules` segment.
 */
export const AttachmentPath = z
  .string()
  .min(1)
  .max(MAX_ATTACHMENT_PATH_CHARS)
  .refine(
    (p) =>
      !p.startsWith('/') &&
      !p.includes('\\') &&
      !CONTROL_CHARS_RE.test(p) &&
      p.toLowerCase().endsWith('.md') &&
      p.split('/').every((segment) => !FORBIDDEN_SEGMENTS.has(segment.toLowerCase())),
    { message: 'Invalid document path' },
  );
export type AttachmentPath = z.infer<typeof AttachmentPath>;

/** Body of PUT /agents/:id/context and PUT /skills/:id/context. */
export const SetContextPathsInput = z.object({
  paths: z.array(AttachmentPath).max(MAX_ATTACHED_DOCS),
});
export type SetContextPathsInput = z.infer<typeof SetContextPathsInput>;

export const ProjectContextDoc = z.object({
  path: z.string(),
  type: ProjectContextDocType,
  size: z.number().int(),
  tokens: z.number().int(),
  /** Distinct agents that use this doc, directly or through an enabled skill link. */
  used_by: z.number().int(),
});
export type ProjectContextDoc = z.infer<typeof ProjectContextDoc>;

export const ProjectContextList = z.object({
  repo_id: z.string(),
  status: z.enum(['ok', 'no_mirror', 'no_matches']),
  globs: z.array(z.string()),
  commit: z.string().nullable(),
  scanned_at: z.string(),
  /** Matching docs before the list cap. */
  total: z.number().int(),
  budget_tokens: z.number().int(),
  docs: z.array(ProjectContextDoc),
});
export type ProjectContextList = z.infer<typeof ProjectContextList>;

export const ProjectContextDocContent = z.object({
  path: z.string(),
  type: ProjectContextDocType,
  size: z.number().int(),
  tokens: z.number().int(),
  content: z.string(),
});
export type ProjectContextDocContent = z.infer<typeof ProjectContextDocContent>;

/** What a run trace records about the project context of one run. */
export const ProjectContextTrace = z.object({
  commit: z.string().nullable(),
  docs: z.array(
    z.object({
      path: z.string(),
      tokens: z.number().int(),
      status: ProjectContextDocStatus,
    }),
  ),
});
export type ProjectContextTrace = z.infer<typeof ProjectContextTrace>;

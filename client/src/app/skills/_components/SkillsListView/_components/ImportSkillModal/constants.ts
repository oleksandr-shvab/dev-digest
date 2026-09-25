/** Constants for the Import-skill modal. */

/** Upload limit enforced by the server (413 above it) — checked client-side first. */
export const MAX_UPLOAD_BYTES = 1024 * 1024;

/** File types the importer accepts. */
export const ACCEPT = ".md,.zip";

/** File-name check matching `ACCEPT` (the `accept` attribute is only a picker hint). */
export const ACCEPT_RE = /\.(md|zip)$/i;

import { readFile } from 'node:fs/promises';
import path from 'node:path';

const NOTES_FILE = '.devdigest/review-notes.md';
const MAX_NOTES_CHARS = 4_000;

export async function loadRepoNotes(repoRoot?: string): Promise<string> {
  if (!repoRoot) return '';
  try {
    const raw = await readFile(path.join(repoRoot, NOTES_FILE), 'utf-8');
    const trimmed = raw.trim();
    if (!trimmed) return '';
    return trimmed.length > MAX_NOTES_CHARS ? `${trimmed.slice(0, MAX_NOTES_CHARS)}\n…` : trimmed;
  } catch {
    return '';
  }
}

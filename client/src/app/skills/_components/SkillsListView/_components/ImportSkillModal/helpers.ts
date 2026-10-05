import { SKILL_NAME_RE } from "@/lib/skill-meta";
import { ACCEPT_RE, MAX_UPLOAD_BYTES } from "./constants";

export type FileProblem = "wrongType" | "tooLarge";

/** Client-side pre-check of a picked file, so an obviously bad upload never hits the API. */
export function fileProblem(file: { name: string; size: number }): FileProblem | null {
  if (!ACCEPT_RE.test(file.name)) return "wrongType";
  if (file.size > MAX_UPLOAD_BYTES) return "tooLarge";
  return null;
}

export const isValidSlug = (name: string): boolean => name.length <= 64 && SKILL_NAME_RE.test(name);

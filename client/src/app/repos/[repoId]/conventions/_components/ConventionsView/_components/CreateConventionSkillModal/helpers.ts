import { SKILL_NAME_RE } from "@/lib/skill-meta";

export const isValidSlug = (name: string): boolean => name.length > 0 && name.length <= 64 && SKILL_NAME_RE.test(name);

import type { Skill, SkillInput, SkillType } from "@devdigest/shared";
import { MAX_SKILL_BODY_CHARS, SKILL_NAME_RE } from "@/lib/skill-meta";

/** The editable fields of the Config form. */
export interface SkillFormValues {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  enabled: boolean;
}

export type FormErrors = Partial<Record<"name" | "description" | "body", string>>;

/** i18n key suffixes (under `skills.config.`) for each validation failure. */
export function validateSkillForm(v: Pick<SkillFormValues, "name" | "description" | "body">): FormErrors {
  const errors: FormErrors = {};
  if (!v.name) errors.name = "nameRequired";
  else if (v.name.length > 64 || !SKILL_NAME_RE.test(v.name)) errors.name = "nameInvalid";
  if (!v.description.trim()) errors.description = "descriptionRequired";
  if (!v.body.trim()) errors.body = "bodyRequired";
  else if (v.body.length > MAX_SKILL_BODY_CHARS) errors.body = "bodyTooLong";
  return errors;
}

/** Fields that differ from the saved skill — the body of the PUT. */
export function buildPatch(skill: Skill, v: SkillFormValues): Partial<SkillInput> {
  const patch: Partial<SkillInput> = {};
  if (v.name !== skill.name) patch.name = v.name;
  if (v.description !== skill.description) patch.description = v.description;
  if (v.type !== skill.type) patch.type = v.type;
  if (v.body !== skill.body) patch.body = v.body;
  if (v.enabled !== skill.enabled) patch.enabled = v.enabled;
  return patch;
}

/** Body / description / type changes create a version (rename and enabled don't). */
export function isContentChange(patch: Partial<SkillInput>): boolean {
  return patch.body !== undefined || patch.description !== undefined || patch.type !== undefined;
}

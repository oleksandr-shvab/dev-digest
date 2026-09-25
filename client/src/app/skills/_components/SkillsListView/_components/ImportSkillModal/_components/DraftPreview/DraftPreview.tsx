"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Chip, FormField, Icon, Markdown, SelectInput, TextInput } from "@devdigest/ui";
import type { SkillImportDraft, SkillType } from "@devdigest/shared";
import { SKILL_TYPES } from "@/lib/skill-meta";
import { isValidSlug } from "../../helpers";
import { s } from "./styles";

/** The user-editable part of a draft. The body is intentionally read-only here. */
export interface DraftForm {
  name: string;
  description: string;
  type: SkillType;
}

/** Step 2 of the import: review the parsed draft, fix name/description/type, see what was ignored. */
export function DraftPreview({
  draft,
  form,
  onChange,
  nameConflict,
  onChooseAnother,
}: {
  draft: SkillImportDraft;
  form: DraftForm;
  onChange: (patch: Partial<DraftForm>) => void;
  nameConflict: boolean;
  onChooseAnother: () => void;
}) {
  const t = useTranslations("skills");
  const [raw, setRaw] = React.useState(false);
  const typeOptions = SKILL_TYPES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));
  const nameError = nameConflict
    ? t("import.nameConflict", { name: form.name })
    : !isValidSlug(form.name)
      ? t("import.nameInvalid")
      : null;

  return (
    <div style={s.wrap}>
      <div role="note" style={s.trust}>
        <Icon.AlertTriangle size={16} style={s.trustIcon} />
        <span>{t("import.trust")}</span>
      </div>

      <div style={s.fileRow}>
        <Icon.FileText size={15} />
        <span className="mono" style={s.fileName}>
          {draft.file.name}
        </span>
        <Button kind="tertiary" size="sm" onClick={onChooseAnother}>
          {t("import.chooseAnother")}
        </Button>
      </div>

      <FormField
        label={t("import.name")}
        required
        hint={nameError ? <span role="alert" style={s.error}>{nameError}</span> : undefined}
      >
        <TextInput value={form.name} onChange={(name) => onChange({ name })} mono aria-label={t("import.name")} />
      </FormField>
      <FormField label={t("import.description")} required>
        <TextInput
          value={form.description}
          onChange={(description) => onChange({ description })}
          aria-label={t("import.description")}
        />
      </FormField>
      <FormField label={t("import.type")}>
        <SelectInput value={form.type} onChange={(v) => onChange({ type: v as SkillType })} options={typeOptions} />
      </FormField>

      <FormField
        label={t("import.body")}
        right={
          <span style={s.bodyHead}>
            <Chip active={!raw} onClick={() => setRaw(false)}>
              {t("import.rendered")}
            </Chip>
            <Chip active={raw} onClick={() => setRaw(true)}>
              {t("import.raw")}
            </Chip>
            <span className="tnum" style={s.tokens}>
              {t("import.tokens", { count: draft.tokens })}
            </span>
          </span>
        }
      >
        <div style={s.bodyBox}>
          {raw ? (
            <pre className="mono" style={s.raw}>
              {draft.body}
            </pre>
          ) : (
            <Markdown>{draft.body}</Markdown>
          )}
        </div>
      </FormField>

      {draft.ignored.length > 0 && (
        <div style={s.section}>
          <div style={s.sectionTitle}>{t("import.ignoredTitle")}</div>
          <ul style={s.list}>
            {draft.ignored.map((ig) => (
              <li key={ig.path} className="mono">
                {t("import.ignoredEntry", { path: ig.path, reason: t(`import.reason.${ig.reason}`) })}
              </li>
            ))}
          </ul>
        </div>
      )}

      {draft.warnings.length > 0 && (
        <div style={s.section}>
          <div style={s.sectionTitle}>{t("import.warnings")}</div>
          <ul style={s.list}>
            {draft.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ImportSkillModal — two-step import: pick a .md/.zip → server parses it into a
   draft (nothing is stored) → review/edit → Save posts a normal POST /skills. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import type { Skill, SkillImportDraft, SkillType } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useCreateSkill, useImportSkillPreview, useSkills } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { FilePicker } from "./_components/FilePicker";
import { DraftPreview, type DraftForm } from "./_components/DraftPreview";
import { fileProblem, isValidSlug } from "./helpers";
import { s } from "./styles";

export function ImportSkillModal({ onClose, onSaved }: { onClose: () => void; onSaved: (skill: Skill) => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data: skills } = useSkills();
  const preview = useImportSkillPreview();
  const create = useCreateSkill();
  const [draft, setDraft] = React.useState<SkillImportDraft | null>(null);
  const [form, setForm] = React.useState<DraftForm | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [nameTaken, setNameTaken] = React.useState(false);

  const pick = (file: File) => {
    setError(null);
    const problem = fileProblem(file);
    if (problem) return setError(t(`import.${problem}`));
    preview.mutate(file, {
      onSuccess: (d) => {
        setDraft(d);
        setForm({ name: d.name, description: d.description, type: d.type as SkillType });
      },
      onError: (e) => setError(e instanceof ApiError ? e.message : t("import.failed")),
    });
  };

  const reset = () => {
    setDraft(null);
    setForm(null);
    setError(null);
    setNameTaken(false);
  };

  const name = form?.name ?? "";
  // A name is taken if the draft said so (and it's unchanged), or it matches an existing skill.
  const conflict =
    nameTaken || (!!draft && name === draft.name && draft.name_conflict) || (skills ?? []).some((sk) => sk.name === name);
  const canSave = !!draft && !!form && !conflict && isValidSlug(name) && form.description.trim() !== "" && !create.isPending;

  const save = () => {
    if (!draft || !form || !canSave) return;
    create.mutate(
      {
        name: form.name,
        description: form.description,
        type: form.type,
        body: draft.body,
        source: "imported_file",
        message: `Imported from ${draft.file.name}`,
      },
      {
        onSuccess: (skill) => {
          toast.success(t("import.saved", { name: skill.name }));
          onSaved(skill);
        },
        onError: (e) => {
          if (e instanceof ApiError && e.status === 409) setNameTaken(true);
        },
      },
    );
  };

  return (
    <Modal
      width={760}
      title={t("import.title")}
      subtitle={t("import.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("import.cancel")}
          </Button>
          <Button kind="primary" icon="Check" onClick={save} disabled={!canSave} loading={create.isPending}>
            {create.isPending ? t("import.saving") : t("import.save")}
          </Button>
        </div>
      }
    >
      {draft && form ? (
        <DraftPreview
          draft={draft}
          form={form}
          onChange={(patch) => {
            setNameTaken(false);
            setForm({ ...form, ...patch });
          }}
          nameConflict={conflict}
          onChooseAnother={reset}
        />
      ) : (
        <div style={s.body}>
          <FilePicker onPick={pick} busy={preview.isPending} />
          {error && (
            <div role="alert" style={s.error}>
              {error}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

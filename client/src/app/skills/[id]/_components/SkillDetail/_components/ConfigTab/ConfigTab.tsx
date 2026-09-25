/* Skill ConfigTab — name / description / type / body form with version-aware
   save ("What changed?" message), used for both existing skills and /skills/new. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, FormField, Icon, SelectInput, TextInput, Toggle } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useCreateSkill, useUpdateSkill } from "@/lib/hooks/skills";
import { MAX_SKILL_BODY_CHARS, SKILL_TYPES } from "@/lib/skill-meta";
import { useToast } from "@/lib/toast";
import { SkillBodyEditor } from "./_components/SkillBodyEditor";
import { DEFAULT_TYPE, MESSAGE_MAX } from "./constants";
import { buildPatch, isContentChange, validateSkillForm } from "./helpers";
import { s } from "./styles";

/**
 * `skill` undefined = the /skills/new form. The parent remounts this (via `key`)
 * when the saved skill changes version, so local state is always seeded from props.
 */
export function ConfigTab({
  skill,
  importedFile,
  onDirtyChange,
}: {
  skill?: Skill;
  /** File name an imported skill came from (when known). */
  importedFile?: string | null;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const t = useTranslations("skills");
  const router = useRouter();
  const toast = useToast();
  const create = useCreateSkill();
  const update = useUpdateSkill();
  const isNew = !skill;

  const [name, setName] = React.useState(skill?.name ?? "");
  const [description, setDescription] = React.useState(skill?.description ?? "");
  const [type, setType] = React.useState<SkillType>(skill?.type ?? DEFAULT_TYPE);
  const [body, setBody] = React.useState(skill?.body ?? "");
  // null = untouched, so a toggle flipped from the list card is not reported as an unsaved edit.
  const [enabledEdit, setEnabledEdit] = React.useState<boolean | null>(null);
  const [message, setMessage] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);
  const [nameTaken, setNameTaken] = React.useState(false);

  const enabled = enabledEdit ?? skill?.enabled ?? true;
  const values = { name, description, type, body, enabled };
  const patch = skill ? buildPatch(skill, values) : {};
  const dirty = skill ? Object.keys(patch).length > 0 : name !== "" || description !== "" || body !== "";
  const bodyDirty = skill ? body !== skill.body : false;
  const contentChanged = isContentChange(patch);
  const errors = validateSkillForm(values);
  const pending = create.isPending || update.isPending;

  // Report dirtiness upward (Preview note, list-navigation guard) and warn on tab close.
  React.useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);
  React.useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const onError = (e: unknown) => {
    // Other failures reach the user through the global mutation-error toast.
    if (e instanceof ApiError && e.status === 409) setNameTaken(true);
  };

  const save = () => {
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;
    if (!skill) {
      create.mutate(
        { name, description, type, body, enabled },
        {
          onSuccess: (created) => {
            toast.success(t("config.created"));
            router.push(`/skills/${created.id}`);
          },
          onError,
        },
      );
      return;
    }
    const trimmed = message.trim();
    update.mutate(
      { id: skill.id, patch: contentChanged && trimmed ? { ...patch, message: trimmed } : patch },
      {
        onSuccess: (saved) => {
          setMessage("");
          setEnabledEdit(null);
          toast.success(saved.version > skill.version ? t("config.savedVersion", { version: saved.version }) : t("config.saved"));
        },
        onError,
      },
    );
  };

  const cancel = () => {
    if (!skill) return router.push("/skills");
    setName(skill.name);
    setDescription(skill.description);
    setType(skill.type);
    setBody(skill.body);
    setEnabledEdit(null);
    setMessage("");
    setSubmitted(false);
    setNameTaken(false);
  };

  // Name errors show while typing; required errors only after a save attempt.
  const nameErrorKey = errors.name === "nameInvalid" || submitted ? errors.name : undefined;
  const nameError = nameTaken ? t("config.nameTaken") : nameErrorKey ? t(`config.${nameErrorKey}`) : null;
  const fieldError = (key: "description" | "body") => {
    const k = errors[key];
    if (!submitted || !k) return null;
    return t(`config.${k}`, { max: MAX_SKILL_BODY_CHARS });
  };
  const errorNode = (msg: string | null, fallback?: React.ReactNode) =>
    msg ? (
      <span role="alert" style={s.error}>
        {msg}
      </span>
    ) : (
      fallback
    );
  const typeOptions = SKILL_TYPES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));
  const usedBy = skill?.stats?.used_by ?? 0;

  return (
    <div style={s.wrap}>
      {skill?.source === "imported_file" && (
        <div role="note" style={s.imported}>
          <Icon.AlertTriangle size={16} style={s.importedIcon} />
          <span>
            {importedFile
              ? t.rich("config.importedNotice", { file: importedFile, code: (c) => <code className="mono">{c}</code> })
              : t("config.importedNoticeNoFile")}
          </span>
        </div>
      )}
      <div style={s.header}>
        <h2 style={s.h2}>{t("config.title")}</h2>
        {skill && <Badge mono>{t("preview.version", { version: skill.version })}</Badge>}
        <label style={s.enabledLabel}>
          {t("config.enabled")}
          <Toggle on={enabled} onChange={setEnabledEdit} size={16} label={t("config.enabled")} />
        </label>
      </div>

      <FormField label={t("config.name")} required hint={errorNode(nameError, t("config.nameHint"))}>
        <TextInput
          value={name}
          mono
          aria-label={t("config.name")}
          aria-invalid={!!nameError}
          onChange={(v) => {
            setName(v);
            setNameTaken(false);
          }}
        />
      </FormField>
      <FormField
        label={t("config.description")}
        required
        hint={errorNode(fieldError("description"), t("config.descriptionHint"))}
      >
        <TextInput value={description} onChange={setDescription} aria-label={t("config.description")} />
      </FormField>
      <FormField label={t("config.type")}>
        <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} mono={false} />
      </FormField>
      <FormField label={t("config.body")} required hint={errorNode(fieldError("body"))}>
        <SkillBodyEditor name={name} value={body} onChange={setBody} dirty={bodyDirty} invalid={!!fieldError("body")} />
      </FormField>

      <div style={s.footer}>
        {usedBy > 1 && (
          <div style={s.banner}>
            <Icon.Users size={14} />
            {t("config.usedBy", { count: usedBy })}
          </div>
        )}
        {contentChanged && (
          <FormField label={t("config.whatChanged")}>
            <TextInput
              value={message}
              onChange={(v) => setMessage(v.slice(0, MESSAGE_MAX))}
              placeholder={t("config.whatChangedPlaceholder")}
              aria-label={t("config.whatChanged")}
              maxLength={MESSAGE_MAX}
            />
          </FormField>
        )}
        <div style={s.actions}>
          <Button kind="primary" icon="Check" onClick={save} disabled={pending || (!isNew && !dirty)}>
            {pending ? t("config.saving") : t("config.save")}
          </Button>
          <Button kind="ghost" onClick={cancel} disabled={pending}>
            {t("config.cancel")}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* CreateConventionSkillModal — opened from "Create skill" on the Conventions
   page. Loads a body draft from the accepted candidates (no write), then lets
   the user edit the future skill's body and metadata before saving it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, TextInput } from "@devdigest/ui";
import { Checkbox } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useAgents } from "@/lib/hooks";
import { useConventionSkillDraft, useCreateConventionSkill } from "@/lib/hooks/conventions";
import { SkillBodyEditor } from "@/components/skill-body-editor";
import { useToast } from "@/lib/toast";
import { isValidSlug } from "./helpers";
import { s } from "./styles";

export function CreateConventionSkillModal({
  repoId,
  candidateIds,
  onClose,
  onSaved,
}: {
  repoId: string;
  candidateIds: string[];
  onClose: () => void;
  onSaved: (skill: Skill) => void;
}) {
  const t = useTranslations("conventions");
  const toast = useToast();
  const draft = useConventionSkillDraft(repoId);
  const create = useCreateConventionSkill(repoId);
  const { data: agents } = useAgents();

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [body, setBody] = React.useState("");
  const [agentIds, setAgentIds] = React.useState<string[]>([]);
  const [nameTaken, setNameTaken] = React.useState(false);
  const draftMutate = draft.mutate;

  React.useEffect(() => {
    draftMutate(candidateIds, {
      onSuccess: (d) => {
        setName(d.name);
        setDescription(d.description);
        setBody(d.body);
      },
    });
    // Runs once when the modal opens — candidateIds is a snapshot of the accepted selection at that time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleAgent = (id: string) => {
    setAgentIds((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]));
  };

  const nameValid = isValidSlug(name);
  const canCreate = draft.isSuccess && nameValid && description.trim() !== "" && body.trim() !== "" && !create.isPending;

  const save = () => {
    if (!draft.data || !canCreate) return;
    create.mutate(
      {
        name,
        description,
        type: "convention",
        body,
        evidence_files: draft.data.evidence_files,
        candidate_ids: candidateIds,
        agent_ids: agentIds,
      },
      {
        onSuccess: (skill) => {
          toast.success(t("createSkill.saved", { name: skill.name }));
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
      title={t("createSkill.title")}
      subtitle={t("createSkill.subtitle", { count: candidateIds.length })}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("createSkill.cancel")}
          </Button>
          <Button kind="primary" icon="Check" onClick={save} disabled={!canCreate} loading={create.isPending}>
            {create.isPending ? t("createSkill.saving") : t("createSkill.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <p style={s.explainer}>{t("createSkill.explainer", { count: candidateIds.length })}</p>

        <FormField
          label={t("createSkill.name")}
          required
          hint={
            nameTaken
              ? <span style={s.error}>{t("createSkill.nameTaken")}</span>
              : !nameValid && name !== ""
                ? <span style={s.error}>{t("createSkill.nameInvalid")}</span>
                : undefined
          }
        >
          <TextInput
            value={name}
            mono
            aria-label={t("createSkill.name")}
            onChange={(v) => {
              setName(v);
              setNameTaken(false);
            }}
          />
        </FormField>

        <FormField label={t("createSkill.description")} required>
          <TextInput value={description} onChange={setDescription} aria-label={t("createSkill.description")} />
        </FormField>

        <FormField label={t("createSkill.body")} required>
          <SkillBodyEditor name={name} value={body} onChange={setBody} dirty={draft.isSuccess && body !== draft.data?.body} />
        </FormField>

        <FormField label={t("createSkill.linkAgents")}>
          <div style={s.agentList}>
            {agents && agents.length > 0 ? (
              agents.map((agent) => (
                <Checkbox
                  key={agent.id}
                  checked={agentIds.includes(agent.id)}
                  onChange={() => toggleAgent(agent.id)}
                  label={agent.name}
                />
              ))
            ) : (
              <span style={s.empty}>{t("createSkill.noAgents")}</span>
            )}
          </div>
        </FormField>
      </div>
    </Modal>
  );
}

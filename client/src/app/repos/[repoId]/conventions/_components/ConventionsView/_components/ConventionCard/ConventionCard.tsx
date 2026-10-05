/* ConventionCard — one triage card: category, rule, evidence (file:line +
   snippet), confidence, and Accept / Reject / Edit (inline). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ConfidenceNum, SelectInput } from "@devdigest/ui";
import type { ConventionCandidate, ConventionCategory, ConventionPatch } from "@devdigest/shared";
import { CONVENTION_CATEGORIES, CONVENTION_CATEGORY_LABEL } from "@/lib/convention-meta";
import { s } from "./styles";

export function ConventionCard({
  candidate,
  onPatch,
}: {
  candidate: ConventionCandidate;
  onPatch: (patch: ConventionPatch) => void;
}) {
  const t = useTranslations("conventions");
  const [editing, setEditing] = React.useState(false);
  const [rule, setRule] = React.useState(candidate.rule);
  const [category, setCategory] = React.useState<ConventionCategory>(candidate.category);

  const startEdit = () => {
    setRule(candidate.rule);
    setCategory(candidate.category);
    setEditing(true);
  };

  const save = () => {
    const patch: ConventionPatch = {};
    const trimmed = rule.trim();
    if (trimmed && trimmed !== candidate.rule) patch.rule = trimmed;
    if (category !== candidate.category) patch.category = category;
    if (Object.keys(patch).length > 0) onPatch(patch);
    setEditing(false);
  };

  const categoryOptions = CONVENTION_CATEGORIES.map((c) => ({ value: c, label: CONVENTION_CATEGORY_LABEL[c] }));

  return (
    <div style={s.card}>
      <div style={s.headerRow}>
        <Badge color="var(--text-secondary)" bg="var(--bg-hover)">
          {CONVENTION_CATEGORY_LABEL[candidate.category]}
        </Badge>
        {candidate.edited && (
          <Badge color="var(--text-muted)" bg="var(--bg-hover)">
            {t("card.edited")}
          </Badge>
        )}
        <div style={s.spacer} />
        <ConfidenceNum value={candidate.confidence} />
      </div>

      {editing ? (
        <div style={s.editBlock}>
          {/* A plain textarea (not the kit's Textarea) so it can carry a
              per-card aria-label — several cards' edit forms can exist on the
              page, and each needs a unique accessible name to target. */}
          <textarea
            value={rule}
            rows={2}
            aria-label={t("card.editLabel", { rule: candidate.rule })}
            onChange={(e) => setRule(e.target.value)}
            style={s.textarea}
          />
          <SelectInput
            value={category}
            onChange={(v) => setCategory(v as ConventionCategory)}
            options={categoryOptions}
            mono={false}
          />
        </div>
      ) : (
        <p style={s.rule}>{candidate.rule}</p>
      )}

      <div style={s.evidence}>
        <span className="mono" style={s.path}>
          {candidate.evidence_path}:{candidate.evidence_line}
        </span>
        <code className="mono" style={s.snippet}>
          {candidate.evidence_snippet}
        </code>
      </div>

      <div style={s.actions}>
        {editing ? (
          <>
            <Button kind="primary" icon="Check" onClick={save} aria-label={t("card.actionFor", { action: t("card.save"), rule: candidate.rule })}>
              {t("card.save")}
            </Button>
            <Button kind="ghost" onClick={() => setEditing(false)} aria-label={t("card.actionFor", { action: t("card.cancel"), rule: candidate.rule })}>
              {t("card.cancel")}
            </Button>
          </>
        ) : candidate.status === "accepted" ? (
          <>
            <Badge color="var(--ok)" bg="var(--ok-bg)">
              {t("card.accepted")}
            </Badge>
            <Button kind="ghost" onClick={() => onPatch({ status: "pending" })} aria-label={t("card.actionFor", { action: t("card.undo"), rule: candidate.rule })}>
              {t("card.undo")}
            </Button>
          </>
        ) : (
          <>
            <Button
              kind="primary"
              icon="Check"
              onClick={() => onPatch({ status: "accepted" })}
              aria-label={t("card.actionFor", { action: t("card.accept"), rule: candidate.rule })}
            >
              {t("card.accept")}
            </Button>
            <Button
              kind="danger"
              icon="X"
              onClick={() => onPatch({ status: "rejected" })}
              aria-label={t("card.actionFor", { action: t("card.reject"), rule: candidate.rule })}
            >
              {t("card.reject")}
            </Button>
            <Button kind="ghost" icon="Edit" onClick={startEdit} aria-label={t("card.actionFor", { action: t("card.edit"), rule: candidate.rule })}>
              {t("card.edit")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

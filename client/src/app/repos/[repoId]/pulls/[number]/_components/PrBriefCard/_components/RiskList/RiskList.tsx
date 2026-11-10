/* RiskList — the brief's Risk areas: severity (icon + text label), title, the
   files it touches as buttons that open Files changed, and a toggle for the
   explanation. All text is model output: rendered as plain text children only. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { Risk } from "@devdigest/shared";
import { MAX_RISKS, SEVERITY_META } from "../../constants";
import { s, severityLabelFor, chevronFor } from "./styles";

function RiskRow({ risk, onOpenFile }: { risk: Risk; onOpenFile: (path: string, line: number | null) => void }) {
  const t = useTranslations("brief");
  const [open, setOpen] = React.useState(false);
  const explanationId = React.useId();
  const meta = SEVERITY_META[risk.severity];
  const SevIcon = Icon[meta.icon];
  return (
    <li style={s.row}>
      <div style={s.top}>
        <span style={severityLabelFor(meta.color, meta.bg)}>
          <SevIcon size={13} />
          {t(`prBrief.severity.${meta.labelKey}`)}
        </span>
        <span style={s.title}>{risk.title}</span>
        <button
          type="button"
          style={s.chevronBtn}
          aria-expanded={open}
          aria-controls={explanationId}
          aria-label={t("prBrief.showExplanation", { title: risk.title })}
          onClick={() => setOpen((o) => !o)}
        >
          <Icon.ChevronRight size={14} style={chevronFor(open)} />
        </button>
      </div>
      {risk.file_refs.length > 0 && (
        <div style={s.files}>
          {risk.file_refs.map((file) => (
            <button
              key={file}
              type="button"
              className="mono"
              style={s.fileBtn}
              aria-label={t("prBrief.openFile", { file })}
              onClick={() => onOpenFile(file, null)}
            >
              {file}
            </button>
          ))}
        </div>
      )}
      {open && (
        <p id={explanationId} style={s.explanation}>
          {risk.explanation}
        </p>
      )}
    </li>
  );
}

export function RiskList({
  risks,
  onOpenFile,
}: {
  risks: Risk[];
  onOpenFile: (path: string, line: number | null) => void;
}) {
  const t = useTranslations("brief");
  if (risks.length === 0) return null;
  return (
    <section style={s.section}>
      <h3 style={s.heading}>{t("prBrief.riskAreas")}</h3>
      <ul style={s.list}>
        {risks.slice(0, MAX_RISKS).map((risk, i) => (
          <RiskRow key={`${i}-${risk.title}`} risk={risk} onOpenFile={onOpenFile} />
        ))}
      </ul>
    </section>
  );
}

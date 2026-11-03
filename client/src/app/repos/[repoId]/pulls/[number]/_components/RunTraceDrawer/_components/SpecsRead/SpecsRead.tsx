/* SpecsRead — the "Specs read" value of the trace's Configuration: the project
   context docs of the run with tokens and status as plain text; CI runs send
   none; older traces fall back to the bare `specs_read` path list. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { RunTrace } from "@devdigest/shared";
import { s } from "../../styles";

export function SpecsRead({ trace }: { trace: RunTrace }) {
  const t = useTranslations("runs");
  const projectContext = trace.project_context;

  if (trace.config.source === "ci") return <span style={s.specsNone}>{t("trace.config.notUsedInCi")}</span>;

  if (projectContext && projectContext.docs.length > 0) {
    return (
      <div style={s.specsList}>
        {projectContext.docs.map((doc) => (
          <div key={doc.path} style={s.specLine}>
            <span className="mono" style={s.spec}>
              {doc.path}
            </span>
            <span className="tnum" style={s.specMeta}>
              {t("trace.config.docTokens", { count: doc.tokens })}
            </span>
            <span className="mono" style={s.specMeta}>
              {doc.status}
            </span>
          </div>
        ))}
        {projectContext.commit && (
          <span className="mono" style={s.specMeta}>
            {t("trace.config.commit", { sha: projectContext.commit.slice(0, 7) })}
          </span>
        )}
      </div>
    );
  }

  return (
    <div style={s.specsWrap}>
      {trace.specs_read.length === 0 ? (
        <span style={s.specsNone}>{t("trace.config.none")}</span>
      ) : (
        trace.specs_read.map((sp, i) => (
          <span key={i} className="mono" style={s.spec}>
            {sp}
          </span>
        ))
      )}
    </div>
  );
}

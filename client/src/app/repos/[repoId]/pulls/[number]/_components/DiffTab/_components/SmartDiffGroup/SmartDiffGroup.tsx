/* SmartDiffGroup — one role group on the Files changed tab: a collapsible
   header (role label, files-with-findings counter, file count) over the shared
   DiffViewer for the group's files. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile, SmartDiffRole } from "@devdigest/shared";
import { DiffViewer, type DiffCommentApi, type DiffFindingApi } from "@/components/diff-viewer";
import { COLLAPSED_BY_DEFAULT, ROLE_LABEL_KEY } from "./constants";
import { s, chevronFor } from "./styles";

export function SmartDiffGroup({
  role,
  files,
  filesWithFindings,
  commenting,
  findingApi,
}: {
  role: SmartDiffRole;
  files: PrFile[];
  /** Files with an open finding (a file count, not a finding count). */
  filesWithFindings: number;
  commenting: DiffCommentApi;
  findingApi: DiffFindingApi;
}) {
  const t = useTranslations("prReview");
  const [open, setOpen] = React.useState(files.length > 0 && !COLLAPSED_BY_DEFAULT.has(role));

  return (
    <div style={s.group}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setOpen((o) => !o);
        }}
        style={s.header}
      >
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <span style={s.label}>{t(ROLE_LABEL_KEY[role])}</span>
        {filesWithFindings > 0 && (
          <span
            role="img"
            aria-label={t("smartDiff.filesWithFindings", { count: filesWithFindings })}
            style={s.withFindings}
          >
            <span style={s.dot} />
            {filesWithFindings}
          </span>
        )}
        <span style={s.count}>{t("smartDiff.filesCount", { count: files.length })}</span>
      </div>
      {open && <DiffViewer files={files} commenting={commenting} findingApi={findingApi} />}
    </div>
  );
}

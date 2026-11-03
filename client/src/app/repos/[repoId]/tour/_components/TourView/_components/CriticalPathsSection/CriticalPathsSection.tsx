/* CriticalPathsSection — the index-chosen files, each with its one-line note and
   a commit-pinned GitHub link. Paths and notes are rendered as text only. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { OnboardingTour } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { s } from "./styles";

export function CriticalPathsSection({
  criticalPaths,
  repoFullName,
  commitSha,
}: {
  criticalPaths: OnboardingTour["critical_paths"];
  repoFullName: string;
  commitSha: string;
}) {
  const t = useTranslations("tour");
  return (
    <div>
      {criticalPaths.source === "file_rank" && <p style={s.rank}>{t("files.byFileRank")}</p>}
      <ul style={s.list}>
        {criticalPaths.items.map((item) => (
          <li key={item.path} style={s.row}>
            <Icon.File size={14} style={s.icon} />
            <span>
              <span className="mono" style={s.path}>
                {item.path}
              </span>
              {item.note !== null && <span style={s.note}>{` — ${item.note}`}</span>}
            </span>
            <a
              href={githubBlobUrl(repoFullName, commitSha, item.path)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("files.openOnGithub", { path: item.path })}
              style={s.open}
            >
              {t("files.open")}
              <Icon.ExternalLink size={12} />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

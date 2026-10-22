"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, MonoLink } from "@devdigest/ui";
import type { DownstreamImpact } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { s } from "./styles";

interface DownstreamGroupProps {
  impact: DownstreamImpact;
  repoFullName: string | null;
  headSha: string;
}

/** One changed symbol and what depends on it. Symbol names, paths and endpoint strings are
    repository content: rendered as JSX text only, and every `href` is built by `githubBlobUrl`
    (fixed github.com host, encoded path segments), so no `javascript:` URL can reach it. */
export function DownstreamGroup({ impact, repoFullName, headSha }: DownstreamGroupProps) {
  const t = useTranslations("blast");
  const [open, setOpen] = React.useState(true);
  const Chevron = open ? Icon.ChevronDown : Icon.ChevronRight;
  return (
    <article style={s.group}>
      <h3 style={s.header}>
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} style={s.toggle}>
          <Chevron size={14} />
          <span className="mono" style={s.symbol}>
            {impact.symbol}
          </span>
          <span style={s.count}>{t("callerCount", { count: impact.callers.length })}</span>
        </button>
      </h3>
      {open && (
        <ul style={s.callers}>
          {impact.callers.map((c) => {
            const label = `${c.file}:${c.line}`;
            return (
              <li key={`${c.file}:${c.name}`} style={s.caller}>
                <Icon.CornerDownRight size={13} />
                {repoFullName ? (
                  <MonoLink href={githubBlobUrl(repoFullName, headSha, c.file, c.line)}>{label}</MonoLink>
                ) : (
                  <span className="mono">{label}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {open && impact.endpoints_affected.length > 0 && (
        <ul aria-label={t("chips.endpoints")} style={s.chips}>
          {impact.endpoints_affected.map((e) => (
            <li key={e}>
              <Badge mono icon="Globe" color="var(--info)" bg="var(--info-bg)">
                {e}
              </Badge>
            </li>
          ))}
        </ul>
      )}
      {open && impact.crons_affected.length > 0 && (
        <ul aria-label={t("chips.crons")} style={s.chips}>
          {impact.crons_affected.map((c) => (
            <li key={c}>
              <Badge mono icon="Clock" color="var(--warn)" bg="var(--warn-bg)">
                {c}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

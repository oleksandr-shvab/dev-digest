/* FindingCounts — the PR list's FINDINGS cell: per-severity icon+number for
   the latest review batch (dismissed findings already excluded server-side).
   See server/specs/pr-list-finding-counts.md and
   client/specs/pr-list-finding-counts.md. */
"use client";

import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { FindingCounts as FindingCountsShape } from "@/lib/types";

const ORDER = ["CRITICAL", "WARNING", "SUGGESTION"] as const;

export function FindingCounts({ counts }: { counts: FindingCountsShape | null | undefined }) {
  const t = useTranslations("prReview");
  const entries = counts
    ? ORDER.filter((sev) => counts[sev] > 0).map((sev) => ({ sev, n: counts[sev] }))
    : [];

  if (entries.length === 0) {
    return <span style={{ color: "var(--text-muted)" }}>—</span>;
  }

  const label = entries.map(({ sev, n }) => t(`list.findingsItem.${sev}`, { count: n })).join(" · ");

  return (
    <div aria-label={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {entries.map(({ sev, n }) => {
        const meta = SEV[sev];
        const I = Icon[meta.icon];
        return (
          <span
            key={sev}
            title={t(`list.findingsItem.${sev}`, { count: n })}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              color: meta.c,
              fontSize: 12,
              borderBottom: "1px dashed currentColor",
              lineHeight: 1.3,
            }}
          >
            <I size={12} />
            <span className="mono">{n}</span>
          </span>
        );
      })}
    </div>
  );
}

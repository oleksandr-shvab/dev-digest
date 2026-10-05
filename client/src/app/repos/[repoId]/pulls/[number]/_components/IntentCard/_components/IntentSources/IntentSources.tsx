"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { IntentSource } from "@devdigest/shared";

const titleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.07em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  marginBottom: 6,
};
const listStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: 18,
  fontSize: 13,
  color: "var(--text-secondary)",
  lineHeight: 1.55,
};

/** The sources of a derived intent: what was read, then what could not be (with why).
    Every `ref` and `detail` is rendered as plain text — never as a link. */
export function IntentSources({ sources }: { sources: IntentSource[] }) {
  const t = useTranslations("brief");
  const used = sources.filter((src) => src.status === "used");
  const unavailable = sources.filter((src) => src.status === "unavailable");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={titleStyle}>{t("intent.sources")}</div>
        <ul style={listStyle}>
          {used.map((src) => (
            <li key={`${src.kind}:${src.ref}`}>
              {t(`intent.sourceKind.${src.kind}`)} {src.ref}
            </li>
          ))}
        </ul>
      </div>
      {unavailable.length > 0 && (
        <div>
          <div style={titleStyle}>{t("intent.missingContext")}</div>
          <ul style={listStyle}>
            {unavailable.map((src) => (
              <li key={`${src.kind}:${src.ref}`}>
                {t(`intent.sourceKind.${src.kind}`)} {src.ref}
                {src.detail ? ` — ${src.detail}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@devdigest/ui";
import type { SkillVersion } from "@devdigest/shared";
import { buildVersionDiff, isUnchanged } from "../../helpers";
import { s } from "./styles";

const MARK = { add: "+", del: "-", ctx: " " } as const;

/** Line diff of an old version against the current one (body, plus description/type if they differ). */
export function VersionDiffModal({
  from,
  to,
  onClose,
}: {
  from: SkillVersion;
  to: SkillVersion;
  onClose: () => void;
}) {
  const t = useTranslations("skills");
  const sections = React.useMemo(() => buildVersionDiff(from, to), [from, to]);
  return (
    <Modal width={820} title={t("versions.diffTitle", { from: from.version, to: to.version })} onClose={onClose}>
      <div style={s.body}>
        {isUnchanged(sections) && <p style={s.none}>{t("versions.noChanges")}</p>}
        {sections.map((sec) => (
          <section key={sec.key}>
            <h3 style={s.sectionTitle}>{t(`versions.${sec.key}`)}</h3>
            <div className="mono" style={s.box} role="group" aria-label={t(`versions.${sec.key}`)}>
              {sec.lines.map((l, i) => (
                <div key={i} data-kind={l.kind} style={s.line(l.kind)}>
                  <span aria-hidden="true" style={s.mark}>
                    {MARK[l.kind]}
                  </span>
                  <span>{l.text}</span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Modal>
  );
}

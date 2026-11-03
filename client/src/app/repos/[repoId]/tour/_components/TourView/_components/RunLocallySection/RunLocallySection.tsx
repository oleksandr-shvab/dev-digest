/* RunLocallySection — numbered one-line commands, each with a copy button. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { IconBtn } from "@devdigest/ui";
import type { OnboardingTour } from "@devdigest/shared";
import { s } from "./styles";

export function RunLocallySection({
  steps,
  onCopy,
}: {
  steps: OnboardingTour["run_steps"];
  onCopy: (text: string, kind: "command") => void;
}) {
  const t = useTranslations("tour");
  return (
    <ol style={s.list}>
      {steps.map((step, i) => (
        <li key={`${i}:${step.command}`} style={s.row}>
          <span style={s.num}>{i + 1}</span>
          <code className="mono" style={s.command}>
            {step.command}
          </code>
          <IconBtn icon="Copy" label={t("copy.command", { n: i + 1 })} onClick={() => onCopy(step.command, "command")} />
        </li>
      ))}
    </ol>
  );
}

/* ArchitectureSection — the LLM summary (Markdown, no raw HTML), an optional
   Mermaid diagram, and the files it points at as plain-text chips. */
"use client";

import React from "react";
import { Markdown } from "@devdigest/ui";
import type { OnboardingTour } from "@devdigest/shared";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import { s } from "./styles";

export function ArchitectureSection({ architecture }: { architecture: OnboardingTour["architecture"] }) {
  const { summary_md, diagram, links } = architecture;
  return (
    <div>
      <div style={s.summary}>
        <Markdown>{summary_md}</Markdown>
      </div>
      {diagram !== null && (
        <div style={s.diagram}>
          <MermaidDiagram chart={diagram} />
        </div>
      )}
      {links.length > 0 && (
        <ul style={s.links}>
          {links.map((link) => (
            <li key={`${link.path}:${link.label}`} style={s.chip}>
              <span>{link.label}</span>
              <span className="mono" style={s.chipPath}>
                {link.path}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

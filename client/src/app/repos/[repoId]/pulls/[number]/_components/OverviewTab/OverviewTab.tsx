"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { IntentCard } from "../IntentCard";
import { BlastRadiusCard } from "../BlastRadiusCard";
import { PrBriefCard } from "../PrBriefCard";
import { s } from "./styles";

interface OverviewTabProps {
  repoId: string;
  prBody: string | null | undefined;
  prId: string | null;
  repoFullName: string | null;
  headSha: string;
  /** Paths of the PR's changed files (the brief only links to files in the diff). */
  diffPaths: string[];
  /** Opens Files changed on a file, and a line when given. */
  onOpenFile: (path: string, line: number | null) => void;
}

export function OverviewTab({
  repoId,
  prBody,
  prId,
  repoFullName,
  headSha,
  diffPaths,
  onOpenFile,
}: OverviewTabProps) {
  return (
    <>
      <PrBriefCard prId={prId} diffPaths={diffPaths} onOpenFile={onOpenFile} />
      <IntentCard prId={prId} />
      <BlastRadiusCard repoId={repoId} prId={prId} repoFullName={repoFullName} headSha={headSha} />
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}

"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { useBlastResync } from "./hooks/useBlastResync";
import { s } from "./styles";

interface ResyncButtonProps {
  repoId: string;
  prId: string;
}

/** Resyncs the repository index; the blast radius refreshes by itself once the index advances. */
export function ResyncButton({ repoId, prId }: ResyncButtonProps) {
  const t = useTranslations("blast");
  const { start, canStart, running, timedOut } = useBlastResync(repoId, prId);
  return (
    <>
      <Button kind="ghost" size="sm" icon="RefreshCw" loading={running} disabled={!canStart} onClick={start}>
        {t(running ? "resync.running" : "resync.start")}
      </Button>
      {timedOut && (
        <span role="status" style={s.timeout}>
          {t("resync.timeout")}
        </span>
      )}
    </>
  );
}

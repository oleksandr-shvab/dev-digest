"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown, Modal } from "@devdigest/ui";
import { useProjectContextDoc } from "@/lib/hooks/project-context";
import { s } from "./styles";

/** Read-only preview of one doc, rendered through the sanitising Markdown primitive. */
export function DocPreviewModal({ repoId, path, onClose }: { repoId: string; path: string; onClose: () => void }) {
  const t = useTranslations("context");
  const { data, isLoading, isError } = useProjectContextDoc(repoId, path);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <Modal width={820} title={<span className="mono">{path}</span>} onClose={onClose}>
      <div style={s.body}>
        {isLoading && <span style={s.muted}>{t("picker.previewLoading")}</span>}
        {isError && <span style={s.error}>{t("picker.previewError")}</span>}
        {data && <Markdown>{data.content}</Markdown>}
      </div>
    </Modal>
  );
}

"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { ACCEPT } from "../../constants";
import { s } from "./styles";

/** Click-or-drop file target for `.md` / `.zip` (limit stated under the prompt). */
export function FilePicker({ onPick, busy }: { onPick: (file: File) => void; busy?: boolean }) {
  const t = useTranslations("skills");
  const [over, setOver] = React.useState(false);

  return (
    <label
      style={s.zone(over)}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const file = e.dataTransfer.files[0];
        if (file) onPick(file);
      }}
    >
      <Icon.Upload size={22} style={s.icon} />
      <span style={s.title}>{t("import.dropTitle")}</span>
      <span style={s.hint}>{t("import.dropHint")}</span>
      <input
        type="file"
        accept={ACCEPT}
        aria-label={t("import.inputLabel")}
        disabled={busy}
        style={s.input}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
          // Allow re-picking the same file after an error.
          e.target.value = "";
        }}
      />
      {busy && <span style={s.hint}>{t("import.parsing")}</span>}
    </label>
  );
}

/* CopyFallback — shown when the Clipboard API is unavailable or rejects: a
   read-only field, focused and fully selected, so the reader can copy by hand.
   A native <input> because the kit Textarea cannot carry an aria-label. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { s } from "./styles";

export function CopyFallback({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  const t = useTranslations("tour");
  const ref = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, [text]);

  return (
    <div style={s.wrap}>
      <input
        ref={ref}
        readOnly
        value={text}
        aria-label={t("copy.manual")}
        className="mono"
        style={s.input}
        onKeyDown={(e) => {
          if (e.key === "Escape") onDismiss();
        }}
      />
      <Button kind="tertiary" size="sm" onClick={onDismiss}>
        {t("copy.dismiss")}
      </Button>
    </div>
  );
}

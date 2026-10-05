"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";

/** In-app confirmation for Restore (a native confirm() can't be driven deterministically by the e2e runner). */
export function RestoreConfirmModal({
  version,
  next,
  pending,
  onConfirm,
  onClose,
}: {
  version: number;
  /** Version number the restore will create. */
  next: number;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("skills");
  return (
    <Modal
      width={460}
      title={t("versions.restoreTitle", { version })}
      onClose={onClose}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <Button kind="ghost" onClick={onClose}>
            {t("versions.cancel")}
          </Button>
          <Button kind="primary" icon="History" onClick={onConfirm} loading={pending}>
            {t("versions.confirmRestore")}
          </Button>
        </div>
      }
    >
      <p style={{ padding: 24, fontSize: 14, lineHeight: 1.5 }}>{t("versions.restoreConfirm", { version, next })}</p>
    </Modal>
  );
}

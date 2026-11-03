"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge, Button, Checkbox, Icon, IconBtn } from "@devdigest/ui";
import type { ProjectContextDoc } from "@devdigest/shared";
import { DOC_TYPE_STYLE } from "../../constants";
import { fileName, folderOf } from "../../helpers";
import { DocPreviewModal } from "../DocPreviewModal";
import { s } from "./styles";

export interface DocRowProps {
  path: string;
  doc: ProjectContextDoc | null;
  variant: "agent" | "skill";
  /** Own attached rows are sortable; unattached and inherited rows are not. */
  attached: boolean;
  /** Read-only inherited row: no checkbox, no handle; `via` names the skill. */
  inheritedVia?: string;
  notFoundIn?: string;
  dragDisabled: boolean;
  /** Preview needs a repo; without one the control is hidden. */
  repoId: string | null;
  onToggle: (attach: boolean) => void;
}

/** One doc: drag handle (attached rows), checkbox, filename, folder, type badge, tokens, Preview. */
export function DocRow({
  path,
  doc,
  variant,
  attached,
  inheritedVia,
  notFoundIn,
  dragDisabled,
  repoId,
  onToggle,
}: DocRowProps) {
  const t = useTranslations("context");
  const [previewing, setPreviewing] = React.useState(false);
  const triggerRef = React.useRef<HTMLSpanElement | null>(null);
  const sortable = attached && inheritedVia === undefined;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: path,
    disabled: !sortable || dragDisabled,
  });

  const closePreview = () => {
    setPreviewing(false);
    // Return focus to the control that opened the dialog.
    queueMicrotask(() => triggerRef.current?.querySelector("button")?.focus());
  };
  const canPreview = repoId !== null && doc !== null;
  const openPreview = () => setPreviewing(true);

  return (
    <div
      ref={setNodeRef}
      style={{ ...s.row(isDragging, notFoundIn !== undefined), transform: CSS.Transform.toString(transform), transition }}
    >
      {sortable ? (
        <button
          ref={setActivatorNodeRef}
          type="button"
          aria-label={t("picker.reorderLabel", { path })}
          style={s.handle(dragDisabled)}
          {...attributes}
          {...listeners}
        >
          <Icon.GripVertical size={16} />
        </button>
      ) : (
        <span style={s.handleSpacer} />
      )}
      {inheritedVia === undefined ? (
        <Checkbox
          checked={attached}
          onChange={onToggle}
          label={<span style={s.srOnly}>{t("picker.attachLabel", { path })}</span>}
        />
      ) : (
        <span style={s.readOnlyDot} />
      )}
      <span style={s.names}>
        <span className="mono" style={s.file}>
          {fileName(path)}
        </span>
        <span className="mono" style={s.folder}>
          {folderOf(path)}
        </span>
      </span>
      {notFoundIn !== undefined && <span style={s.notFound}>{t("picker.notFound", { repo: notFoundIn })}</span>}
      {inheritedVia !== undefined && <Badge color="var(--text-muted)">{t("picker.viaSkill", { skill: inheritedVia })}</Badge>}
      {doc && (
        <>
          <Badge color={DOC_TYPE_STYLE[doc.type].color} bg={DOC_TYPE_STYLE[doc.type].bg}>
            {t(`picker.type.${doc.type}`)}
          </Badge>
          <span className="tnum" style={s.tokens}>
            {t("picker.tokens", { count: doc.tokens })}
          </span>
        </>
      )}
      {canPreview && (
        <span ref={triggerRef}>
          {variant === "skill" ? (
            <IconBtn icon="Eye" label={t("picker.previewLabel", { path })} size={26} onClick={openPreview} />
          ) : (
            <Button kind="ghost" size="sm" aria-label={t("picker.previewLabel", { path })} onClick={openPreview}>
              {t("picker.preview")}
            </Button>
          )}
        </span>
      )}
      {previewing && repoId && <DocPreviewModal repoId={repoId} path={path} onClose={closePreview} />}
    </div>
  );
}

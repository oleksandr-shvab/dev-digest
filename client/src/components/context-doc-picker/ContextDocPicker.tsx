/* ContextDocPicker — attach a repo's Markdown docs to an agent or a skill. Shared by
   the agent Context tab and the skill Context tab. Every change (tick, untick,
   reorder) is reported at once through `onChange`; the caller saves it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Badge, Icon, Skeleton } from "@devdigest/ui";
import type { ProjectContextDoc } from "@devdigest/shared";
import { DocRow } from "./_components/DocRow";
import { DND_ID_PREFIX } from "./constants";
import { buildRows, filterByPath, moveItem } from "./helpers";
import { s } from "./styles";

export interface InheritedDoc {
  path: string;
  /** Name of the skill the doc comes from. */
  via: string;
}

export interface ContextDocPickerProps {
  variant: "agent" | "skill";
  title: string;
  helper: string;
  /** Count badge text next to the title, e.g. "2 of 6 attached". */
  badge: string;
  /** The sidebar's selected repo; null when none is selected. */
  repo: { id: string; full_name: string } | null;
  docs: ProjectContextDoc[] | undefined;
  isLoading: boolean;
  isError: boolean;
  /** Own attached paths, in prompt order. */
  attached: string[];
  /** Read-only rows coming from enabled linked skills. */
  inherited?: InheritedDoc[];
  onChange: (paths: string[]) => void;
  saving: boolean;
  /** Message of a failed save, announced through a live region. */
  saveError?: string | null;
  footer?: React.ReactNode;
}

export function ContextDocPicker({
  variant,
  title,
  helper,
  badge,
  repo,
  docs,
  isLoading,
  isError,
  attached,
  inherited = [],
  onChange,
  saving,
  saveError,
  footer,
}: ContextDocPickerProps) {
  const t = useTranslations("context");
  const [filter, setFilter] = React.useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Without a repo there is no list to compare against, so nothing is flagged "not found".
  const listed = repo ? docs : undefined;
  const rows = buildRows(listed, attached);
  const docByPath = new Map((listed ?? []).map((d) => [d.path, d]));
  const filtering = filter.trim() !== "";
  const attachedRows = filterByPath(rows.filter((r) => r.attached), filter);
  // An inherited doc is shown once, as its read-only row — not again as an unattached doc.
  const inheritedPaths = new Set(inherited.map((d) => d.path));
  const restRows = repo ? filterByPath(rows.filter((r) => !r.attached && !inheritedPaths.has(r.path)), filter) : [];
  const inheritedRows = filterByPath(inherited, filter);
  const visibleCount = attachedRows.length + inheritedRows.length + restRows.length;
  const repoName = repo?.full_name ?? "";

  const toggle = (path: string, attach: boolean) =>
    onChange(attach ? [...attached, path] : attached.filter((p) => p !== path));

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = attached.indexOf(String(active.id));
    const to = attached.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onChange(moveItem(attached, from, to));
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{title}</h2>
        <Badge>{badge}</Badge>
        <div style={s.filter}>
          <Icon.Search size={13} style={s.filterIcon} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("picker.filterPlaceholder")}
            aria-label={t("picker.filterPlaceholder")}
            style={s.filterInput}
          />
        </div>
      </div>
      <p style={s.helper}>{helper}</p>

      <div role="status" style={s.status}>
        {saving ? t("picker.saving") : ""}
      </div>
      {saveError && (
        <div role="alert" style={{ ...s.status, ...s.error }}>
          {saveError}
        </div>
      )}

      {!repo && <div style={s.notice}>{t("picker.noRepo")}</div>}
      {repo && isError && (
        <div role="alert" style={{ ...s.notice, color: "var(--crit)" }}>
          {t("picker.loadError")}
        </div>
      )}

      {repo && isLoading ? (
        <Skeleton height={120} />
      ) : (
        <div style={s.list}>
          <DndContext
            id={`${DND_ID_PREFIX}-${variant}`}
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext items={attachedRows.map((r) => r.path)} strategy={verticalListSortingStrategy}>
              {attachedRows.map((r) => (
                <DocRow
                  key={r.path}
                  path={r.path}
                  doc={r.doc}
                  variant={variant}
                  attached
                  notFoundIn={r.notFound ? repoName : undefined}
                  dragDisabled={filtering}
                  repoId={repo?.id ?? null}
                  onToggle={(attach) => toggle(r.path, attach)}
                />
              ))}
            </SortableContext>
            {inheritedRows.map((r) => (
              <DocRow
                key={`inherited:${r.path}`}
                path={r.path}
                doc={docByPath.get(r.path) ?? null}
                variant={variant}
                attached
                inheritedVia={r.via}
                dragDisabled
                repoId={repo?.id ?? null}
                onToggle={() => {}}
              />
            ))}
            {restRows.map((r) => (
              <DocRow
                key={r.path}
                path={r.path}
                doc={r.doc}
                variant={variant}
                attached={false}
                dragDisabled
                repoId={repo?.id ?? null}
                onToggle={(attach) => toggle(r.path, attach)}
              />
            ))}
          </DndContext>
          {repo && !isError && visibleCount === 0 && (
            <div style={s.muted}>{filtering ? t("picker.noMatch") : t("picker.noDocs", { repo: repoName })}</div>
          )}
        </div>
      )}

      {footer && <div style={s.footer}>{footer}</div>}
    </div>
  );
}

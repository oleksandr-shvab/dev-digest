/* ContextView — read-only browser of a repo's Markdown docs: a filterable list on
   the left, the selected doc rendered as Markdown on the right. There is no way to
   edit, create, upload or delete here — the mirror is reset to upstream on every
   resync, so a local edit would be lost. Paths and names render as plain text. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, Icon, Markdown, Skeleton } from "@devdigest/ui";
import { DOC_TYPE_STYLE } from "@/components/context-doc-picker/constants";
import { fileName } from "@/components/context-doc-picker/helpers";
import { useProjectContextDoc, useProjectContextDocs } from "@/lib/hooks/project-context";
import { ageOf, filterDocs, sumTokens } from "./helpers";
import { s } from "./styles";

export function ContextView({
  repoId,
  repoFullName,
  branch,
}: {
  repoId: string;
  repoFullName: string | null;
  branch: string | null;
}) {
  const t = useTranslations("context");
  const { data: list, isLoading, isError, isFetching, refetch } = useProjectContextDocs(repoId);
  const [filter, setFilter] = React.useState("");
  const [selectedPath, setSelectedPath] = React.useState<string | null>(null);

  const docs = list?.docs ?? [];
  const selected = docs.find((d) => d.path === selectedPath) ?? null;
  const { data: content, isLoading: contentLoading, isError: contentError } = useProjectContextDoc(
    repoId,
    selected?.path,
  );
  const visible = filterDocs(docs, filter);

  const header = (
    <div style={s.pageHeader}>
      <div>
        <h1 style={s.title}>{t("page.heading")}</h1>
        {repoFullName && (
          <p style={s.repoLine}>{t("page.repoLine", { repo: repoFullName, branch: branch ?? "—" })}</p>
        )}
        <p style={s.subtitle}>{t("page.subtitle")}</p>
      </div>
      <Button kind="secondary" icon="RefreshCw" onClick={() => void refetch()} disabled={isFetching}>
        {isFetching ? t("page.rescanning") : t("page.rescan")}
      </Button>
    </div>
  );

  if (isLoading) {
    return (
      <>
        {header}
        <Skeleton height={240} />
      </>
    );
  }
  if (isError || !list) {
    return (
      <>
        {header}
        <ErrorState body={t("page.loadError")} onRetry={() => void refetch()} />
      </>
    );
  }
  if (list.status !== "ok") {
    return (
      <>
        {header}
        <EmptyState
          icon="FileText"
          title={t(`page.empty.${list.status}.title`)}
          body={
            <>
              <div>{t(`page.empty.${list.status}.body`)}</div>
              <div className="mono" style={s.globs}>
                {t("page.empty.globs", { globs: list.globs.join("; ") })}
              </div>
            </>
          }
        />
      </>
    );
  }

  const age = ageOf(list.scanned_at, Date.now());

  return (
    <>
      {header}
      {list.total > docs.length && (
        <div role="note" style={s.notice}>
          {t("page.capped", { shown: docs.length, total: list.total })}
        </div>
      )}
      <div style={s.panes}>
        <div style={s.left}>
          <div style={s.filterBox}>
            <Icon.Search size={13} style={s.filterIcon} />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t("page.filterPlaceholder")}
              aria-label={t("page.filterPlaceholder")}
              style={s.filterInput}
            />
          </div>
          <div style={s.list} role="list" aria-label={t("page.docsLabel")}>
            {visible.map((d) => (
              <div role="listitem" key={d.path}>
                <button
                  type="button"
                  aria-current={d.path === selected?.path ? "true" : undefined}
                  style={s.item(d.path === selected?.path)}
                  onClick={() => setSelectedPath(d.path)}
                >
                  <span className="mono" style={s.itemPath}>
                    {d.path}
                  </span>
                  <span style={s.itemMeta}>
                    <Badge color={DOC_TYPE_STYLE[d.type].color} bg={DOC_TYPE_STYLE[d.type].bg}>
                      {t(`picker.type.${d.type}`)}
                    </Badge>
                    <span className="tnum" style={s.tokens}>
                      {t("picker.tokens", { count: d.tokens })}
                    </span>
                  </span>
                </button>
              </div>
            ))}
            {visible.length === 0 && <div style={s.muted}>{t("page.noMatch")}</div>}
          </div>
        </div>

        <div style={s.right}>
          {selected ? (
            <>
              <div style={s.docHead}>
                <span className="mono" style={s.docName}>
                  {fileName(selected.path)}
                </span>
                <Badge color={DOC_TYPE_STYLE[selected.type].color} bg={DOC_TYPE_STYLE[selected.type].bg}>
                  {t(`picker.type.${selected.type}`)}
                </Badge>
                <span style={s.usedBy}>{t("page.usedBy", { count: selected.used_by })}</span>
              </div>
              <div style={s.docBody}>
                {contentLoading && <span style={s.muted}>{t("page.docLoading")}</span>}
                {contentError && (
                  <span role="alert" style={s.error}>
                    {t("page.docError")}
                  </span>
                )}
                {content && <Markdown>{content.content}</Markdown>}
              </div>
            </>
          ) : (
            <div style={s.muted}>{t("page.selectDoc")}</div>
          )}
        </div>
      </div>
      <div style={s.footer}>
        {t("page.footer", {
          files: docs.length,
          tokens: sumTokens(docs),
          ago: t(`page.ago.${age.unit}`, { n: age.n }),
        })}
      </div>
    </>
  );
}

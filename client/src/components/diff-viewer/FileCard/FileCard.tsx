/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count) and, when open, its parsed lines plus any outdated comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile } from "@/lib/types";
import { AUTO_EXPAND_MAX_LINES } from "../constants";
import {
  focusKey,
  isFocusedFile,
  isFocusedLine,
  parsePatch,
  shouldScrollToCard,
  type DiffFocus,
  type Line,
} from "../helpers";
import {
  buildThreads,
  keysForLine,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import { findingsForLine, isOpenFinding, partitionFindings, type DiffFindingApi } from "../findings";
import { s, chevronFor } from "../styles";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";
import { FindingsOutsideDiff } from "../FindingsOutsideDiff";

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

export function FileCard({
  file,
  commenting,
  findingApi,
  focus,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  findingApi?: DiffFindingApi;
  /** File (and line) to open, scroll to and mark. */
  focus?: DiffFocus | null;
}) {
  const t = useTranslations("shell");
  const tReview = useTranslations("prReview");
  const [open, setOpen] = React.useState(
    (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES
  );
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);

  // Open once per new focus target: adjust state while rendering (not in an effect),
  // so the user can still collapse the card afterwards.
  const targeted = isFocusedFile(focus, file.path);
  const targetKey = targeted ? focusKey(focus) : null;
  const [seenFocusKey, setSeenFocusKey] = React.useState<string | null>(null);
  if (targetKey !== seenFocusKey) {
    setSeenFocusKey(targetKey);
    if (targetKey) setOpen(true);
  }

  const rootRef = React.useRef<HTMLDivElement>(null);
  const scrollToCard = shouldScrollToCard(focus, file.path, lines);
  React.useEffect(() => {
    if (targetKey && open && scrollToCard) rootRef.current?.scrollIntoView({ block: "start" });
  }, [targetKey, open, scrollToCard]);

  const renderedKeys = React.useMemo(() => {
    const keys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) keys.add(k);
    return keys;
  }, [lines]);

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, renderedKeys]);

  // Same split for review findings: anchored to a rendered line vs. outside the diff.
  const allFindings = findingApi?.findings;
  const fileFindings = React.useMemo(
    () => (allFindings ?? []).filter((f) => f.file === file.path),
    [allFindings, file.path],
  );
  const { matched: matchedFindings, outsideDiff } = React.useMemo(
    () => partitionFindings(fileFindings, renderedKeys),
    [fileFindings, renderedKeys],
  );

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  return (
    <div
      ref={rootRef}
      style={targeted ? { ...s.fileCard, ...s.fileCardFocused } : s.fileCard}
      aria-current={targeted ? "location" : undefined}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setOpen((o) => !o);
        }}
        style={s.fileHeader}
      >
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {commentCount > 0 && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
        {fileFindings.some(isOpenFinding) && (
          <span role="img" aria-label={tReview("smartDiff.fileHasFindings")} style={s.findingDot} />
        )}
      </div>
      {open && (
        <div style={s.fileBody}>
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln, i) => (
              <CodeLine
                key={i}
                ln={ln}
                path={file.path}
                threads={threadsForLine(ln, matched)}
                commenting={commenting}
                findings={findingsForLine(ln, matchedFindings)}
                findingApi={findingApi}
                focused={isFocusedLine(focus, file.path, ln)}
              />
            ))
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
          {findingApi?.showFindings === true && (
            <FindingsOutsideDiff findings={outsideDiff} findingApi={findingApi} />
          )}
        </div>
      )}
    </div>
  );
}

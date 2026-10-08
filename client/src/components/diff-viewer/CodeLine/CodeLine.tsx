/* CodeLine — one rendered diff line: gutter number, +/- sign, text, plus the
   hover "+" affordance, any anchored comment threads and review findings, and
   an inline composer. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import { FindingCard } from "@/components/finding-card";
import { commentTargetFor, type CommentThread, type DiffCommentApi, cs } from "../comments";
import { LINE_LABEL_KEY } from "../constants";
import { topSeverity, type DiffFindingApi } from "../findings";
import { type Line } from "../helpers";
import { s, lineRowFor, lineSignFor, findingStripeFor, lineLabelFor } from "../styles";
import { CommentThreadView } from "../CommentThreadView";
import { InlineComposer } from "../InlineComposer";

export function CodeLine({
  ln,
  path,
  threads,
  commenting,
  findings,
  findingApi,
}: {
  ln: Line;
  path: string;
  threads: CommentThread[];
  commenting?: DiffCommentApi;
  findings: FindingRecord[];
  findingApi?: DiffFindingApi;
}) {
  const t = useTranslations("prReview");
  const [hover, setHover] = React.useState(false);
  const [composing, setComposing] = React.useState(false);

  if (ln.kind === "hunk") {
    return (
      <div className="mono" style={s.hunk}>
        {ln.text}
      </div>
    );
  }

  const sign = ln.kind === "add" ? "+" : ln.kind === "del" ? "−" : "";
  const target = commenting?.canComment ? commentTargetFor(ln) : null;
  const showAdd = hover && !!target && !composing;
  const sev = topSeverity(findings);

  return (
    <div
      style={cs.rowWrap}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={{ ...lineRowFor(ln.kind), ...(sev ? findingStripeFor(sev) : null) }}>
        <span className="mono tnum" style={{ ...s.lineNo, position: "relative" }}>
          {showAdd && target && (
            <button
              type="button"
              title="Add a comment on this line"
              aria-label="Add a comment on this line"
              onClick={() => setComposing(true)}
              style={cs.addBtn}
            >
              +
            </button>
          )}
          {ln.newNo ?? ln.oldNo ?? ""}
        </span>
        <span className="mono" style={lineSignFor(ln.kind)}>
          {sign}
        </span>
        <span className="mono" style={s.lineText}>
          {ln.text || " "}
        </span>
        {sev && <span style={lineLabelFor(sev)}>{t(LINE_LABEL_KEY[sev])}</span>}
      </div>

      {findingApi?.showFindings === true &&
        findings.map((f) => (
          <div key={f.id} style={cs.thread}>
            <FindingCard
              f={f}
              defaultExpanded
              pending={findingApi.pending}
              onAction={(a) => findingApi.onAction(f.id, a)}
            />
          </div>
        ))}

      {commenting &&
        commenting.showComments &&
        threads.map((th) => (
          <CommentThreadView key={th.rootId} thread={th} commenting={commenting} path={path} />
        ))}

      {commenting && composing && target && (
        <InlineComposer
          commenting={commenting}
          path={path}
          line={target.line}
          side={target.side}
          onClose={() => setComposing(false)}
        />
      )}
    </div>
  );
}

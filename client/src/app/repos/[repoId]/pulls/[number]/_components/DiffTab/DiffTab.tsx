"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button, Chip } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi, type DiffFindingApi } from "@/components/diff-viewer";
import {
  usePrComments,
  useCreatePrComment,
  usePrReviews,
  useSmartDiff,
  useFindingAction,
} from "@/lib/hooks/reviews";
import { notify } from "@/lib/toast";
import type { PrFile } from "@devdigest/shared";
import { SmartDiffGroup } from "./_components/SmartDiffGroup";
import { countFilesWithFindings, groupFilesByRole, pickLatestReviewPerAgent } from "./helpers";
import { s } from "./styles";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
}

export function DiffTab({ prId, filesCount, files, canComment }: DiffTabProps) {
  const t = useTranslations("prReview");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  const { data: reviews } = usePrReviews(prId);
  const { data: smartDiff } = useSmartDiff(prId);
  const action = useFindingAction();
  const [order, setOrder] = React.useState<"smart" | "original">("smart");
  // GitHub comments and review-finding cards share this toggle. It starts
  // shown so a finding is visible as soon as its file is expanded.
  const [showComments, setShowComments] = React.useState(true);

  const commentCount = comments?.length ?? 0;

  const latest = React.useMemo(() => pickLatestReviewPerAgent(reviews ?? []), [reviews]);
  const findings = React.useMemo(() => latest.flatMap((r) => r.findings), [latest]);
  const toggleCount = commentCount + findings.length;

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowComments(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
  };

  const findingApi: DiffFindingApi = {
    findings,
    showFindings: showComments,
    pending: action.isPending,
    onAction: (findingId, act) =>
      action.mutate({ findingId, action: act, prId: prId ?? undefined }),
  };

  const groups = React.useMemo(
    () => (smartDiff ? groupFilesByRole(smartDiff, files) : null),
    [smartDiff, files],
  );

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          <div style={s.controls}>
            {reviews !== undefined && latest.length === 0 && (
              <span style={s.reviewNotRun}>{t("smartDiff.reviewNotRun")}</span>
            )}
            <Chip active={order === "smart"} onClick={() => setOrder("smart")}>
              {t("smartDiff.smartOrder")}
            </Chip>
            <Chip active={order === "original"} onClick={() => setOrder("original")}>
              {t("smartDiff.originalOrder")}
            </Chip>
            {toggleCount > 0 && (
              <Button
                kind="ghost"
                size="sm"
                icon={showComments ? "EyeOff" : "Eye"}
                onClick={() => setShowComments((v) => !v)}
              >
                {showComments ? "Hide comments" : "Show comments"} ({toggleCount})
              </Button>
            )}
          </div>
        }
      >
        Files changed · {filesCount} files
      </SectionLabel>
      {order === "smart" && groups ? (
        <div style={s.groups}>
          {groups.map((g) => (
            <SmartDiffGroup
              key={g.role}
              role={g.role}
              files={g.files}
              filesWithFindings={countFilesWithFindings(g.files, findings)}
              commenting={commenting}
              findingApi={findingApi}
            />
          ))}
        </div>
      ) : (
        <DiffViewer files={files} commenting={commenting} findingApi={findingApi} />
      )}
    </section>
  );
}

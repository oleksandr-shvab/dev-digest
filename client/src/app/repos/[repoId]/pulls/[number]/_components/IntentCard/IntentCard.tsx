/* IntentCard — what the system understood the PR to be for: one sentence, the
   in/out-of-scope lists, how confident the derivation was, and its sources.
   Shown before any review result so the user can check the understanding. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, SectionLabel, Skeleton } from "@devdigest/ui";
import { useDeriveIntent, usePrIntent } from "@/lib/hooks";
import { CONFIDENCE_META } from "./constants";
import { s } from "./styles";
import { IntentSources } from "./_components/IntentSources";

/** One scope column. Items are model output built from PR text: rendered as text only. */
function ScopeColumn({ title, items, none }: { title: string; items: string[]; none: string }) {
  return (
    <div>
      <div style={s.columnTitle}>{title}</div>
      {items.length > 0 ? (
        <ul style={s.list}>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <div style={s.none}>{none}</div>
      )}
    </div>
  );
}

export function IntentCard({ prId }: { prId: string | null }) {
  const t = useTranslations("brief");
  const { data, isLoading, isError } = usePrIntent(prId);
  const derive = useDeriveIntent(prId);

  if (!prId) return null;
  if (isLoading) return <Skeleton height={140} />;
  if (isError) return <div style={s.error}>{t("intent.loadError")}</div>;

  if (!data) {
    return (
      <section style={s.card}>
        <EmptyState
          icon="Target"
          title={t("intent.emptyTitle")}
          body={t("intent.emptyBody")}
          cta={t("intent.derive")}
          onCta={() => derive.mutate()}
          ctaLoading={derive.isPending}
        />
      </section>
    );
  }

  const confidence = CONFIDENCE_META[data.confidence];
  return (
    <section style={s.card}>
      <SectionLabel
        icon="Target"
        right={
          <div style={s.actions}>
            <Badge color={confidence.color} bg={confidence.bg}>
              {t(`intent.confidence.${confidence.labelKey}`)}
            </Badge>
            <Button
              kind="ghost"
              size="sm"
              icon="RefreshCw"
              onClick={() => derive.mutate()}
              loading={derive.isPending}
            >
              {t("intent.rederive")}
            </Button>
          </div>
        }
      >
        {t("block.intent")}
      </SectionLabel>
      {data.stale && (
        <div role="status" style={s.stale}>
          {t("intent.stale")}
        </div>
      )}
      <p style={s.sentence}>{data.intent}</p>
      <div style={s.scopeGrid}>
        <ScopeColumn title={t("intent.inScope")} items={data.in_scope} none={t("intent.none")} />
        <ScopeColumn title={t("intent.outOfScope")} items={data.out_of_scope} none={t("intent.none")} />
      </div>
      <IntentSources sources={data.sources} />
      {data.model && <div style={s.meta}>{t("intent.model", { model: data.model })}</div>}
    </section>
  );
}

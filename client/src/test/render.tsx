import React from "react";
import { render, type RenderResult } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import skills from "../../messages/en/skills.json";
import agents from "../../messages/en/agents.json";
import runs from "../../messages/en/runs.json";
import { ToastProvider } from "@/lib/toast";

/** A QueryClient that never retries or caches across tests. */
export function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
}

/** Render with the providers every skills/agents component needs: i18n, React Query and toasts.
    Uses RTL's `wrapper`, so `rerender(...)` keeps the providers. */
export function renderWithProviders(ui: React.ReactElement, qc: QueryClient = makeQueryClient()): RenderResult {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ skills, agents, runs }}>
        <ToastProvider>{children}</ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  return render(ui, { wrapper: Wrapper });
}

/** Minimal Skill fixture. */
export function makeSkill(over: Partial<import("@devdigest/shared").Skill> = {}): import("@devdigest/shared").Skill {
  return {
    id: "s1",
    name: "uncovered-branches",
    description: "Flag branches without tests",
    type: "rubric",
    source: "manual",
    body: "# Rule\nCheck every branch.",
    enabled: true,
    version: 1,
    ...over,
  };
}

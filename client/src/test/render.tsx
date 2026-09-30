import React from "react";
import { render, type RenderResult } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import skills from "../../messages/en/skills.json";
import agents from "../../messages/en/agents.json";
import runs from "../../messages/en/runs.json";
import conventions from "../../messages/en/conventions.json";
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
      <NextIntlClientProvider locale="en" messages={{ skills, agents, runs, conventions }}>
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

/** Minimal Agent fixture. */
export function makeAgent(over: Partial<import("@devdigest/shared").Agent> = {}): import("@devdigest/shared").Agent {
  return {
    id: "a1",
    name: "Test Quality Reviewer",
    description: "Checks test quality.",
    provider: "openai",
    model: "gpt-4.1",
    system_prompt: "Review.",
    enabled: true,
    version: 1,
    strategy: "single-pass",
    ci_fail_on: "critical",
    repo_intel: true,
    ...over,
  };
}

/** Minimal ConventionCandidate fixture. */
export function makeConvention(
  over: Partial<import("@devdigest/shared").ConventionCandidate> = {},
): import("@devdigest/shared").ConventionCandidate {
  return {
    id: "c1",
    repo_id: "r1",
    category: "naming",
    rule: "Use camelCase for variables.",
    evidence_path: "src/a.ts",
    evidence_line: 12,
    evidence_snippet: "const fooBar = 1;",
    confidence: 0.8,
    status: "pending",
    edited: false,
    created_at: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

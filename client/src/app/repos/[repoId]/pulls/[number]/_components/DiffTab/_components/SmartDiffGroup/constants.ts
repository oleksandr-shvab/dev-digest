import type { SmartDiffRole } from "@devdigest/shared";

/** Role → i18n key (prReview namespace) of the group header label. */
export const ROLE_LABEL_KEY: Record<SmartDiffRole, string> = {
  core: "smartDiff.coreLabel",
  tests: "smartDiff.testsLabel",
  wiring: "smartDiff.wiringLabel",
  docs: "smartDiff.docsLabel",
  boilerplate: "smartDiff.boilerplateLabel",
};

/** Roles whose group starts collapsed (an empty group is collapsed too). */
export const COLLAPSED_BY_DEFAULT: ReadonlySet<SmartDiffRole> = new Set<SmartDiffRole>([
  "docs",
  "boilerplate",
]);

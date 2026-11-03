import type { IconName } from "@devdigest/ui";

/** The five parts of the tour, in the fixed order they are shown. `id` is the
    scroll target of the card; `titleKey` is a `tour` message key. */
export const TOUR_SECTIONS = [
  { id: "architecture", titleKey: "sections.architecture", icon: "Boxes" },
  { id: "critical-paths", titleKey: "sections.criticalPaths", icon: "Target" },
  { id: "run-locally", titleKey: "sections.runLocally", icon: "Play" },
  { id: "reading-path", titleKey: "sections.readingPath", icon: "FileText" },
  { id: "first-tasks", titleKey: "sections.firstTasks", icon: "ListChecks" },
] as const satisfies readonly { id: string; titleKey: string; icon: IconName }[];

export type TourSectionId = (typeof TOUR_SECTIONS)[number]["id"];

export const TOUR_SECTION_IDS: readonly TourSectionId[] = TOUR_SECTIONS.map((section) => section.id);

/** How long a "Copied" announcement stays on screen. */
export const ANNOUNCE_MS = 3000;

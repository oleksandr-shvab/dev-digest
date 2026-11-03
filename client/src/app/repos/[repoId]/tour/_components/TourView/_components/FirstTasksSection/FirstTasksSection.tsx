/* FirstTasksSection — grounded starter tasks; an empty list says so. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { OnboardingTour } from "@devdigest/shared";
import { s } from "./styles";

export function FirstTasksSection({ tasks }: { tasks: OnboardingTour["first_tasks"] }) {
  const t = useTranslations("tour");
  if (tasks.length === 0) return <p style={s.empty}>{t("tasks.none")}</p>;
  return (
    <ul style={s.list}>
      {tasks.map((task) => (
        <li key={task.title} style={s.task}>
          <div style={s.title}>{task.title}</div>
          <p style={s.description}>{task.description}</p>
          <ul style={s.paths}>
            {task.paths.map((path) => (
              <li key={path} className="mono" style={s.path}>
                {path}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

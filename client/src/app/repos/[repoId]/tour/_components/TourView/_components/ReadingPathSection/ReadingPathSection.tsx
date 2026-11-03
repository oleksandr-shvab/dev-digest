/* ReadingPathSection — numbered files in reading order, each with its reason. */
"use client";

import React from "react";
import type { OnboardingTour } from "@devdigest/shared";
import { s } from "./styles";

export function ReadingPathSection({ items }: { items: OnboardingTour["reading_path"] }) {
  return (
    <ol style={s.list}>
      {items.map((item, i) => (
        <li key={item.path} style={s.row}>
          <span style={s.num}>{i + 1}</span>
          <div>
            <div className="mono" style={s.path}>
              {item.path}
            </div>
            {item.reason !== null && <div style={s.reason}>{item.reason}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

/* useActiveSection — which section is the topmost one on screen. One
   IntersectionObserver over the section elements; it only runs once the
   sections are in the DOM (`enabled`). */
"use client";

import React from "react";

export function useActiveSection(ids: readonly string[], enabled: boolean): string {
  const [current, setCurrent] = React.useState(ids[0] ?? "");

  React.useEffect(() => {
    if (!enabled || typeof IntersectionObserver === "undefined") return;
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        const topmost = ids.find((id) => visible.has(id));
        if (topmost) setCurrent(topmost);
      },
      { rootMargin: "0px 0px -60% 0px" },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [ids, enabled]);

  return current;
}

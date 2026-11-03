/* useClipboardCopy — write text to the clipboard and announce the result. When
   the Clipboard API is missing or rejects, hand the text back as `fallbackText`
   so the page can show a read-only field to copy by hand. */
"use client";

import React from "react";
import { ANNOUNCE_MS } from "../constants";

export function useClipboardCopy() {
  const [announcement, setAnnouncement] = React.useState("");
  const [fallbackText, setFallbackText] = React.useState<string | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  React.useEffect(() => () => clearTimeout(timer.current), []);

  const copy = React.useCallback(async (text: string, successMsg: string) => {
    clearTimeout(timer.current);
    try {
      if (!navigator.clipboard) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(text);
      setFallbackText(null);
      setAnnouncement(successMsg);
      timer.current = setTimeout(() => setAnnouncement(""), ANNOUNCE_MS);
    } catch {
      setAnnouncement("");
      setFallbackText(text);
    }
  }, []);

  const clearFallback = React.useCallback(() => setFallbackText(null), []);

  return { copy, announcement, fallbackText, clearFallback };
}

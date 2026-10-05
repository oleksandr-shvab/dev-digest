"use client";

import { useEffect } from "react";
import { ErrorState } from "@devdigest/ui";

/* Route-segment error boundary (Next.js convention) — catches render-time
   throws anywhere under app/ that no closer error.tsx handles. Without this,
   an unhandled throw (e.g. a malformed API payload hitting a .map/property
   access) white-screens the whole app with no recovery UI. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorState
      title="Something went wrong"
      body="An unexpected error occurred. You can try again, or reload the page if it keeps happening."
      onRetry={reset}
      fullScreen
    />
  );
}

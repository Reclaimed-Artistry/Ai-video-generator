"use client";

import { useEffect } from "react";
import { ErrorState, RetryButton } from "@/components/ErrorState";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaces the real cause in the console instead of an opaque parse error.
    console.error("Route error:", error);
  }, [error]);

  return (
    <ErrorState
      code="ERR 500"
      title="That page failed to load."
      description="Something went wrong while rendering this page. Trying again often clears it — if it persists, the error detail below will say why."
      detail={error.digest ? `Digest: ${error.digest}` : (error.message ?? null)}
      retry={<RetryButton onRetry={reset} />}
    />
  );
}

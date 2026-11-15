"use client";

import { useEffect } from "react";
import { ErrorState, RetryButton } from "@/components/ErrorState";

export default function ProjectsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Projects route error:", error);
  }, [error]);

  return (
    <ErrorState
      code="ERR 500"
      title="Your videos could not be loaded."
      description="The workspace archive is unreachable — most often a database connection problem. Retrying usually clears it."
      detail={error.digest ? `Digest: ${error.digest}` : (error.message ?? null)}
      retry={<RetryButton onRetry={reset} />}
    />
  );
}

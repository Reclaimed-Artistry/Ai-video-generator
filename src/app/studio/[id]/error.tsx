"use client";

import { useEffect } from "react";
import { ErrorState, RetryButton } from "@/components/ErrorState";

export default function StudioError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Studio route error:", error);
  }, [error]);

  return (
    <ErrorState
      code="ERR 500"
      title="This project could not be opened."
      description="The editor failed to load this sequence — most often because the database is unreachable or the project record is missing."
      detail={error.digest ? `Digest: ${error.digest}` : (error.message ?? null)}
      retry={<RetryButton onRetry={reset} />}
    />
  );
}

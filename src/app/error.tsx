"use client";

import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { StatusScreen, primaryActionClass, secondaryActionClass } from "@/components/shell/status-screen";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

/** Root error boundary. Raw error messages are never shown (only the digest for support). */
export default function RootError({ error, reset }: ErrorPageProps) {
  return (
    <StatusScreen
      icon={TriangleAlert}
      title="Something went wrong"
      description={
        error.digest
          ? `We couldn't load this page. Please try again. (Reference: ${error.digest})`
          : "We couldn't load this page. Please try again."
      }
      actions={
        <>
          <button type="button" onClick={reset} className={primaryActionClass}>
            Try again
          </button>
          <Link href="/dashboard" className={secondaryActionClass}>
            Go to dashboard
          </Link>
        </>
      }
    />
  );
}

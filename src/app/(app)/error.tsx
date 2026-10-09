"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { primaryActionClass, secondaryActionClass } from "@/components/shell/status-screen";

type AppErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

/** Error boundary inside the shell: navigation stays usable while the page failed. */
export default function AppError({ error, reset }: AppErrorProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center py-10">
      <div
        role="alert"
        className="w-full max-w-lg card-surface p-8 text-center"
      >
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-danger-bg text-danger">
          <TriangleAlert className="size-6" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-xl font-bold text-text">We couldn&apos;t load this page</h1>
        <p className="mt-2 text-[15px] text-muted">
          Something went wrong on our side. Please try again — if it keeps happening, let the owner know.
        </p>
        {error.digest ? (
          <p className="mt-3 text-xs text-muted">Reference: {error.digest}</p>
        ) : null}
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <button type="button" onClick={reset} className={primaryActionClass}>
            <RotateCcw className="size-4" aria-hidden="true" />
            Try again
          </button>
          <Link href="/dashboard" className={secondaryActionClass}>
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

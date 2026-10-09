"use client";

import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";

/** Re-runs the server render of the current page (all widgets refetch). */
export function RetryButton({ label = "Try again" }: { label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      loading={pending}
      onClick={() => startTransition(() => router.refresh())}
      className="shrink-0"
    >
      {pending ? null : <RotateCcw aria-hidden="true" />}
      {label}
    </Button>
  );
}

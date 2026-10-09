"use client";

import { Hand } from "lucide-react";
import { useTransition } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { claimRequestAction } from "../actions";
import { useActionRunner } from "./use-action-runner";

export type ClaimButtonProps = {
  requestId: string;
  requestCode: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
  className?: string;
};

/** Admin: take ownership of an unassigned request (rpc assign_material_request to self). */
export function ClaimButton({ requestId, requestCode, size = "sm", variant = "secondary", className }: ClaimButtonProps) {
  const run = useActionRunner();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size={size}
      variant={variant}
      loading={pending}
      className={className}
      aria-label={`Claim request ${requestCode}`}
      onClick={() => startTransition(async () => void (await run(() => claimRequestAction(requestId), "Request assigned to you.")))}
    >
      <Hand aria-hidden="true" />
      Claim
    </Button>
  );
}

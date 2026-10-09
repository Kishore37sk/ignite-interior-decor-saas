"use client";

import { Send } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Textarea } from "@/components/ui/textarea";
import { addCommentAction } from "../actions";
import { useActionRunner } from "./use-action-runner";

/** Post a note on a material request (rpc add_material_request_comment). */
export function CommentForm({ requestId }: { requestId: string }) {
  const run = useActionRunner();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (body.trim().length === 0) {
      setError("Write a comment first.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await run(() => addCommentAction({ request_id: requestId, body }), "Comment added.");
      if (!result.ok) {
        setError(result.fieldErrors?.body?.[0] ?? result.error);
        return;
      }
      setBody("");
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-2">
      <FormField label="Add a comment" hideLabel error={error}>
        <Textarea
          rows={3}
          maxLength={2000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a note for the team — delivery updates, questions, site instructions…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) e.currentTarget.form?.requestSubmit();
          }}
        />
      </FormField>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted">Visible to everyone working on this request.</span>
        <Button type="submit" size="sm" loading={pending}>
          <Send aria-hidden="true" />
          Post
        </Button>
      </div>
    </form>
  );
}

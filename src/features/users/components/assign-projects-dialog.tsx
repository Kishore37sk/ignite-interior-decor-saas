"use client";

import { FolderKanban, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { PROJECT_STATUS_LABELS, ROLE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { ProjectStatus } from "@/types/database";
import { getAssignmentOptionsAction, saveProjectAssignmentsAction, type AssignmentOptions } from "../actions";
import type { ManagedUser } from "./types";

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; options: AssignmentOptions };

/** Checkbox list of projects → assign_project_member / remove_project_member. */
export function AssignProjectsDialog({
  user,
  open,
  onOpenChange,
}: {
  user: ManagedUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [pending, startTransition] = useTransition();
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setState({ kind: "loading" });
    getAssignmentOptionsAction(user.id)
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setState({ kind: "error", message: res.error });
          return;
        }
        setState({ kind: "ready", options: res.data });
        setSelected(new Set(res.data.assigned));
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error", message: "We couldn't load projects. Please try again." });
      });
    return () => {
      cancelled = true;
    };
  }, [open, user.id, reloadKey]);

  const initial = useMemo(
    () => new Set(state.kind === "ready" ? state.options.assigned : []),
    [state],
  );
  const add = [...selected].filter((id) => !initial.has(id));
  const remove = [...initial].filter((id) => !selected.has(id));
  const dirty = add.length + remove.length > 0;

  const visible = useMemo(() => {
    if (state.kind !== "ready") return [];
    const q = filter.trim().toLowerCase();
    const list = q
      ? state.options.projects.filter((p) =>
          [p.name, p.project_code, p.client_name, p.site_manager_name ?? ""].some((v) => v.toLowerCase().includes(q)),
        )
      : state.options.projects;
    // Assigned projects first, then alphabetical (already ordered by name).
    return [...list].sort((a, b) => Number(initial.has(b.id)) - Number(initial.has(a.id)));
  }, [state, filter, initial]);

  function change(next: boolean) {
    if (pending) return;
    if (!next) setFilter("");
    onOpenChange(next);
  }

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function save() {
    startTransition(async () => {
      try {
        const res = await saveProjectAssignmentsAction({ user_id: user.id, add, remove });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success(res.message ?? "Assignments saved.");
        onOpenChange(false);
        setFilter("");
        router.refresh();
      } catch {
        toast.error("We couldn't reach the server. Check your connection and try again.");
      }
    });
  }

  const inactive = state.kind === "ready" && !state.options.active;
  const roleLabel = user.role && user.role !== "owner" ? ROLE_LABELS[user.role] : "team member";

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent size="lg" hideClose={pending} onInteractOutside={(e) => pending && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Assign projects to {user.full_name}</DialogTitle>
          <DialogDescription>
            Tick the projects {user.full_name.split(" ")[0]} works on as {roleLabel.toLowerCase()}. Unticking keeps the
            history — the assignment is marked as removed, never deleted.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          {state.kind === "loading" ? (
            <div className="flex items-center justify-center gap-3 py-12 text-sm text-muted">
              <Spinner size="sm" label={null} /> Loading projects…
            </div>
          ) : state.kind === "error" ? (
            <div className="flex flex-col items-start gap-3">
              <p role="alert" className="rounded-xl bg-danger-bg px-3 py-2 text-sm font-medium text-danger-text">
                {state.message}
              </p>
              <Button variant="outline" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
                Try again
              </Button>
            </div>
          ) : state.options.projects.length === 0 ? (
            <EmptyState
              compact
              icon={FolderKanban}
              title="No projects to assign"
              description="Create a project first, then come back to assign the team."
            />
          ) : (
            <>
              {inactive ? (
                <p className="rounded-xl bg-warning-bg px-3 py-2 text-sm text-warning-text">
                  This user is inactive: you can remove assignments, but not add new ones. Activate them first, or use
                  “Reassign projects” on their profile.
                </p>
              ) : null}
              <Input
                type="search"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Filter by project, code, client or site manager…"
                aria-label="Filter projects"
                leading={<Search />}
              />
              <p className="text-xs text-muted" aria-live="polite">
                {selected.size} selected
                {dirty ? ` · ${add.length} to add, ${remove.length} to remove` : ""}
              </p>
              <ul className="flex max-h-[45dvh] flex-col divide-y divide-border-soft overflow-y-auto rounded-xl border border-border-soft">
                {visible.map((project) => {
                  const checked = selected.has(project.id);
                  const disabled = inactive && !initial.has(project.id);
                  const id = `assign-${project.id}`;
                  return (
                    <li key={project.id}>
                      <label
                        htmlFor={id}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 px-3 py-3 transition-colors hover:bg-surface-muted",
                          checked && "bg-soft/40",
                          disabled && "cursor-not-allowed opacity-60",
                        )}
                      >
                        <Checkbox
                          id={id}
                          checked={checked}
                          disabled={disabled || pending}
                          onCheckedChange={(value) => toggle(project.id, value === true)}
                          className="mt-0.5"
                        />
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-sm font-medium text-text">{project.name}</span>
                          <span className="truncate text-xs text-muted">
                            {project.project_code} · {project.client_name} ·{" "}
                            {PROJECT_STATUS_LABELS[project.status as ProjectStatus] ?? project.status}
                            {project.site_manager_name ? ` · SM: ${project.site_manager_name}` : " · No site manager"}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
                {visible.length === 0 ? (
                  <li className="px-3 py-6 text-center text-sm text-muted">No projects match “{filter}”.</li>
                ) : null}
              </ul>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => change(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} loading={pending} loadingText="Saving…" disabled={!dirty || state.kind !== "ready"}>
            Save assignments
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

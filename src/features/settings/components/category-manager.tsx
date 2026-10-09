"use client";

import { ArrowDown, ArrowUp, Check, Pencil, Plus, Tags, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  createCategoryAction,
  moveCategoryAction,
  renameCategoryAction,
  setCategoryActiveAction,
} from "../actions";

export type CategoryItem = { id: string; name: string; is_active: boolean; materials: number };

const NETWORK = "We couldn't reach the server. Check your connection and try again.";

function CategoryRow({
  category,
  first,
  last,
  busy,
  onBusy,
}: {
  category: CategoryItem;
  first: boolean;
  last: boolean;
  busy: boolean;
  onBusy: (busy: boolean) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const disabled = busy || pending;

  function run(task: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) {
    onBusy(true);
    startTransition(async () => {
      try {
        const res = await task();
        if (!res.ok) {
          setError(res.error ?? null);
          toast.error(res.error ?? "Something went wrong.");
          return;
        }
        setError(null);
        if (res.message) toast.success(res.message);
        after?.();
        router.refresh();
      } catch {
        toast.error(NETWORK);
      } finally {
        onBusy(false);
      }
    });
  }

  function onRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    run(() => renameCategoryAction(category.id, formData), () => setEditing(false));
  }

  return (
    <li className={cn("flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center", !category.is_active && "bg-surface-muted/60")}>
      {editing ? (
        <form onSubmit={onRename} noValidate className="flex min-w-0 flex-1 items-start gap-2">
          <FormField label={`Rename ${category.name}`} hideLabel name="name" error={error} className="flex-1">
            <Input defaultValue={category.name} maxLength={60} autoFocus className="h-10" />
          </FormField>
          <Button type="submit" size="icon" loading={pending} aria-label="Save name">
            <Check aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setEditing(false);
              setError(null);
            }}
            disabled={pending}
            aria-label="Cancel rename"
          >
            <X aria-hidden="true" />
          </Button>
        </form>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className={cn("truncate font-medium", category.is_active ? "text-text" : "text-muted line-through")}>
            {category.name}
          </span>
          {category.materials > 0 ? (
            <Badge tone="muted" size="sm">{`${category.materials} material${category.materials === 1 ? "" : "s"}`}</Badge>
          ) : null}
          {!category.is_active ? <Badge tone="warning" size="sm">Hidden</Badge> : null}
        </div>
      )}
      {editing ? null : (
        <div className="flex items-center gap-1 sm:shrink-0">
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={disabled || first}
            onClick={() => run(() => moveCategoryAction(category.id, "up"))}
            aria-label={`Move ${category.name} up`}
          >
            <ArrowUp aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={disabled || last}
            onClick={() => run(() => moveCategoryAction(category.id, "down"))}
            aria-label={`Move ${category.name} down`}
          >
            <ArrowDown aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            onClick={() => setEditing(true)}
            aria-label={`Rename ${category.name}`}
          >
            <Pencil aria-hidden="true" />
          </Button>
          <label className="ml-2 inline-flex items-center gap-2 text-xs text-muted">
            <Switch
              checked={category.is_active}
              disabled={disabled}
              onCheckedChange={(checked) => run(() => setCategoryActiveAction(category.id, checked))}
              aria-label={`${category.name} active`}
            />
            <span className="w-12">{category.is_active ? "Active" : "Hidden"}</span>
          </label>
        </div>
      )}
    </li>
  );
}

/** Add, rename, reorder and activate/deactivate material categories. */
export function CategoryManager({ categories }: { categories: CategoryItem[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        const res = await createCategoryAction(formData);
        if (!res.ok) {
          setError(res.fieldErrors?.name?.[0] ?? res.error);
          toast.error(res.error);
          return;
        }
        setError(null);
        formRef.current?.reset();
        toast.success(res.message ?? "Category added.");
        router.refresh();
      } catch {
        toast.error(NETWORK);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <form ref={formRef} onSubmit={onAdd} noValidate className="flex items-start gap-2">
        <FormField label="New category" hideLabel name="name" error={error} className="flex-1">
          <Input placeholder="New category name, e.g. Glass" maxLength={60} />
        </FormField>
        <Button type="submit" loading={pending} variant="secondary">
          <Plus aria-hidden="true" />
          Add
        </Button>
      </form>
      {categories.length === 0 ? (
        <EmptyState compact icon={Tags} title="No categories yet" description="Add categories to organise the material catalog." />
      ) : (
        <ul aria-busy={busy || undefined} className="flex flex-col divide-y divide-border-soft rounded-xl border border-border-soft">
          {categories.map((category, index) => (
            <CategoryRow
              key={category.id}
              category={category}
              first={index === 0}
              last={index === categories.length - 1}
              busy={busy}
              onBusy={setBusy}
            />
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">
        Hidden categories stay on existing materials and requests but aren&apos;t offered for new ones. Renaming also
        updates catalog materials; past requests keep the name they were raised with.
      </p>
    </div>
  );
}

"use client";

import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult, FieldErrors } from "@/lib/action-result";
import { createClientAction, updateClientAction, type ClientSaveResult, type DuplicateClientMatch } from "../actions";

export type ClientFormDefaults = {
  name: string;
  email: string;
  phone: string;
  alternate_phone: string;
  address: string;
  city: string;
  state: string;
  country: string;
  notes: string;
};

export type ClientFormProps =
  | { mode: "create"; defaults?: Partial<ClientFormDefaults>; cancelHref: string }
  | { mode: "edit"; clientId: string; defaults: ClientFormDefaults; cancelHref: string };

const EMPTY: ClientFormDefaults = {
  name: "",
  email: "",
  phone: "",
  alternate_phone: "",
  address: "",
  city: "",
  state: "",
  country: "India",
  notes: "",
};

/** Owner client create/edit form with inline validation and duplicate warning. */
export function ClientForm(props: ClientFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateClientMatch[] | null>(null);
  const defaults = { ...EMPTY, ...props.defaults };

  function submit(allowDuplicate: boolean) {
    const form = formRef.current;
    if (!form) return;
    const formData = new FormData(form);
    if (allowDuplicate) formData.set("allow_duplicate", "1");
    setFormError(null);
    startTransition(async () => {
      let result: ActionResult<ClientSaveResult>;
      try {
        result =
          props.mode === "create"
            ? await createClientAction(formData)
            : await updateClientAction(props.clientId, formData);
      } catch {
        result = { ok: false, error: "We couldn't reach the server. Check your connection and try again." };
      }
      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        setFormError(result.error);
        toast.error(result.error);
        return;
      }
      setFieldErrors({});
      if (result.data.status === "duplicate") {
        setDuplicates(result.data.matches);
        return;
      }
      setDuplicates(null);
      toast.success(result.message ?? "Client saved.");
      router.push(`/clients/${result.data.id}`);
      router.refresh();
    });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit(false);
  }

  const err = (field: string) => fieldErrors[field];

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <section aria-labelledby="client-contact" className="card-surface flex flex-col gap-5 p-5 sm:p-6">
        <div>
          <h2 id="client-contact" className="text-lg font-semibold text-text">
            Client details
          </h2>
          <p className="mt-1 text-sm text-muted">Name and contact numbers the team uses to reach the client.</p>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <FormField label="Client name" name="name" required error={err("name")} className="md:col-span-2">
            <Input defaultValue={defaults.name} maxLength={160} autoComplete="name" placeholder="e.g. Ramesh Kumar" />
          </FormField>
          <FormField label="Phone" name="phone" error={err("phone")} hint="Indian mobile or landline, e.g. +91 98450 12345">
            <Input type="tel" inputMode="tel" defaultValue={defaults.phone} maxLength={20} autoComplete="tel" />
          </FormField>
          <FormField label="Alternate phone" name="alternate_phone" error={err("alternate_phone")}>
            <Input type="tel" inputMode="tel" defaultValue={defaults.alternate_phone} maxLength={20} />
          </FormField>
          <FormField label="Email" name="email" error={err("email")} className="md:col-span-2">
            <Input type="email" inputMode="email" defaultValue={defaults.email} maxLength={254} autoComplete="email" />
          </FormField>
        </div>
      </section>

      <section aria-labelledby="client-address" className="card-surface flex flex-col gap-5 p-5 sm:p-6">
        <h2 id="client-address" className="text-lg font-semibold text-text">
          Address
        </h2>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <FormField label="Address" name="address" error={err("address")} className="md:col-span-3">
            <Textarea rows={2} defaultValue={defaults.address} maxLength={500} autoComplete="street-address" />
          </FormField>
          <FormField label="City" name="city" error={err("city")}>
            <Input defaultValue={defaults.city} maxLength={80} autoComplete="address-level2" />
          </FormField>
          <FormField label="State" name="state" error={err("state")}>
            <Input defaultValue={defaults.state} maxLength={80} autoComplete="address-level1" />
          </FormField>
          <FormField label="Country" name="country" error={err("country")}>
            <Input defaultValue={defaults.country} maxLength={80} autoComplete="country-name" />
          </FormField>
          <FormField label="Notes" name="notes" error={err("notes")} className="md:col-span-3" hint="Internal notes — visible to the owner and assigned site managers.">
            <Textarea rows={3} defaultValue={defaults.notes} maxLength={2000} />
          </FormField>
        </div>
      </section>

      {duplicates && duplicates.length > 0 ? (
        <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-warning/40 bg-warning-bg p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning-text" />
            <div className="min-w-0 text-sm text-warning-text">
              <p className="font-semibold">
                {duplicates.map((match, index) => (
                  <span key={match.id}>
                    {index === 0 ? "Possible duplicate: " : ", "}
                    <Link href={`/clients/${match.id}`} className="underline underline-offset-2" target="_blank">
                      {match.name} ({match.client_code})
                    </Link>
                    {match.archived ? " — archived" : ""}
                  </span>
                ))}
              </p>
              <p className="mt-1">
                A client with the same phone number or email already exists. Open it to check, or save anyway if this
                is a different person.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setDuplicates(null)} disabled={pending}>
              Review details
            </Button>
            <Button variant="deep" onClick={() => submit(true)} loading={pending}>
              {props.mode === "create" ? "Create anyway" : "Save anyway"}
            </Button>
          </div>
        </div>
      ) : null}

      {formError && Object.keys(fieldErrors).length === 0 ? (
        <p role="alert" className="rounded-xl bg-danger-bg px-4 py-3 text-sm font-medium text-danger-text">
          {formError}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" asChild>
          <Link href={props.cancelHref}>Cancel</Link>
        </Button>
        <Button type="submit" loading={pending} disabled={duplicates !== null && duplicates.length > 0}>
          {props.mode === "create" ? "Create client" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

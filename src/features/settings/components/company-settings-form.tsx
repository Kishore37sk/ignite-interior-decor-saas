"use client";

import { Building2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { FieldErrors } from "@/lib/action-result";
import { updateCompanySettingsAction } from "../actions";

export type CompanySettingsValues = {
  company_name: string;
  logo_url: string;
  contact_name: string;
  email: string;
  phone: string;
  address: string;
};

export function CompanySettingsForm({ defaults }: { defaults: CompanySettingsValues }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [logo, setLogo] = useState(defaults.logo_url);
  const [logoBroken, setLogoBroken] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        const res = await updateCompanySettingsAction(formData);
        if (!res.ok) {
          setFieldErrors(res.fieldErrors ?? {});
          toast.error(res.error);
          return;
        }
        setFieldErrors({});
        toast.success(res.message ?? "Saved.");
        router.refresh();
      } catch {
        toast.error("We couldn't reach the server. Check your connection and try again.");
      }
    });
  }

  const err = (field: string) => fieldErrors[field];
  const showLogo = logo.trim() !== "" && !logoBroken;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField label="Company name" name="company_name" required error={err("company_name")} className="md:col-span-2">
          <Input defaultValue={defaults.company_name} maxLength={120} autoComplete="organization" />
        </FormField>
        <div className="flex flex-col gap-3 md:col-span-2 sm:flex-row sm:items-end">
          <span
            aria-hidden="true"
            className="inline-flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border-soft bg-surface-muted text-muted"
          >
            {showLogo ? (
              // eslint-disable-next-line @next/next/no-img-element -- arbitrary owner-provided URL preview
              <img src={logo} alt="" className="size-full object-contain p-1" onError={() => setLogoBroken(true)} />
            ) : (
              <Building2 className="size-6" />
            )}
          </span>
          <FormField
            label="Logo URL"
            name="logo_url"
            error={err("logo_url") ?? (logoBroken ? "This image couldn't be loaded — check the URL." : undefined)}
            hint="A public https:// image link, or /brand/logo.png for the bundled logo."
            className="flex-1"
          >
            <Input
              value={logo}
              onChange={(event) => {
                setLogo(event.target.value);
                setLogoBroken(false);
              }}
              maxLength={500}
              inputMode="url"
              placeholder="/brand/logo.png"
            />
          </FormField>
        </div>
        <FormField label="Contact person" name="contact_name" error={err("contact_name")}>
          <Input defaultValue={defaults.contact_name} maxLength={120} autoComplete="name" />
        </FormField>
        <FormField label="Phone" name="phone" error={err("phone")}>
          <Input type="tel" inputMode="tel" defaultValue={defaults.phone} maxLength={20} autoComplete="tel" />
        </FormField>
        <FormField label="Email" name="email" error={err("email")} className="md:col-span-2">
          <Input type="email" inputMode="email" defaultValue={defaults.email} maxLength={254} autoComplete="email" />
        </FormField>
        <FormField label="Address" name="address" error={err("address")} className="md:col-span-2">
          <Textarea defaultValue={defaults.address} maxLength={500} rows={3} autoComplete="street-address" />
        </FormField>
      </div>
      <div className="flex justify-end">
        <Button type="submit" loading={pending} loadingText="Saving…" className="w-full sm:w-auto">
          Save company details
        </Button>
      </div>
    </form>
  );
}

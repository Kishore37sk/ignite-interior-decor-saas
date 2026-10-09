import { CircleAlert, CircleCheck } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { BRAND } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** Card wrapper with logo, brand name and tagline used by every auth page. */
export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-border-soft bg-white p-7 shadow-pop sm:p-10">
      <div className="flex flex-col items-center text-center">
        <Image src={BRAND.logo} alt="" width={180} height={54} priority className="h-12 w-auto" />
        <p className="mt-3 text-lg font-bold tracking-tight text-deep">{BRAND.name}</p>
        <p className="text-sm text-muted">{BRAND.tagline}</p>
      </div>
      <div className="mt-8">
        <h1 className="text-2xl font-bold tracking-tight text-text">{title}</h1>
        {description ? <p className="mt-1.5 text-[15px] text-muted">{description}</p> : null}
      </div>
      <div className="mt-7">{children}</div>
    </div>
  );
}

export function FormAlert({
  tone = "error",
  children,
  id,
}: {
  tone?: "error" | "success";
  children: ReactNode;
  id?: string;
}) {
  const Icon = tone === "error" ? CircleAlert : CircleCheck;
  return (
    <div
      id={id}
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex gap-3 rounded-xl px-4 py-3 text-sm leading-relaxed",
        tone === "error" ? "bg-danger-bg text-danger-text" : "bg-soft text-deep",
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

export const inputClass =
  "h-12 w-full rounded-xl border border-border bg-white px-4 text-[15px] text-text placeholder:text-subtle transition-colors focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15 aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/15 disabled:bg-background";

export const labelClass = "mb-1.5 block text-sm font-semibold text-text";

export const submitClass =
  "inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-[15px] font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70";

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 text-sm text-danger-text">
      {message}
    </p>
  );
}

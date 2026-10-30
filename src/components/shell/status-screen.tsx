import type { LucideIcon } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { DeveloperCredit } from "@/components/shared/developer-credit";
import { BRAND } from "@/lib/constants";

type StatusScreenProps = {
  icon: LucideIcon;
  code?: string;
  title: string;
  description: string;
  actions: ReactNode;
};

/** Full-page branded message (404, 403, unexpected errors). Server- and client-safe. */
export function StatusScreen({ icon: Icon, code, title, description, actions }: StatusScreenProps) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-12 text-center">
      <Image src={BRAND.logo} alt={BRAND.name} width={150} height={45} className="mb-10 h-10 w-auto" />
      <div className="w-full max-w-md card-surface p-8 sm:p-10">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-soft text-deep">
          <Icon className="size-6" aria-hidden="true" />
        </span>
        {code ? (
          <p className="mt-5 text-sm font-semibold tracking-[0.2em] text-primary-strong">{code}</p>
        ) : null}
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-text">{title}</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">{description}</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">{actions}</div>
      </div>
      <p className="mt-8 text-sm text-muted">
        © {new Date().getFullYear()} {BRAND.name}
      </p>
      <DeveloperCredit className="mt-1" />
    </main>
  );
}

export const primaryActionClass =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";
export const secondaryActionClass =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-soft px-5 text-sm font-semibold text-deep transition-colors hover:bg-soft-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";

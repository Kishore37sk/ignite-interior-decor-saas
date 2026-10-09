import { CalendarClock, ClipboardCheck, IndianRupee, LayoutDashboard } from "lucide-react";
import type { ReactNode } from "react";
import { BRAND } from "@/lib/constants";

// Auth pages read cookies/search params per request.
export const dynamic = "force-dynamic";

const HIGHLIGHTS = [
  {
    icon: LayoutDashboard,
    title: "Every project at a glance",
    text: "Status, progress and handover dates across all your clients.",
  },
  {
    icon: CalendarClock,
    title: "Deadlines you can trust",
    text: "Days remaining, overdue alerts and reminders before handover.",
  },
  {
    icon: ClipboardCheck,
    title: "Materials, on time",
    text: "Site requests reviewed, ordered and delivered — tracked end to end.",
  },
  {
    icon: IndianRupee,
    title: "Costs under control",
    text: "Estimated, approved and actual material spend, side by side.",
  },
] as const;

function BrandPanel() {
  return (
    <aside
      aria-label={`About ${BRAND.name}`}
      className="relative hidden overflow-hidden bg-[linear-gradient(145deg,var(--color-deep)_0%,var(--color-primary-hover)_100%)] text-white lg:flex lg:flex-col lg:justify-between"
    >
      {/* Decorative architectural grid + soft light, CSS only. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:linear-gradient(rgba(255,255,255,0.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.6)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_at_70%_30%,black_20%,transparent_75%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-32 -top-32 size-[520px] rounded-full bg-[radial-gradient(circle,rgba(155,211,90,0.35),transparent_65%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 -left-24 size-[460px] rounded-full border border-white/15"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -left-8 size-[300px] rounded-full border border-white/10"
      />

      <div className="relative px-12 pt-14 xl:px-16">
        <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-white/90 ring-1 ring-white/20">
          <span className="size-1.5 rounded-full bg-lime" aria-hidden="true" />
          {BRAND.tagline}
        </p>
        <h2 className="mt-8 max-w-xl text-4xl font-bold leading-[1.15] tracking-tight xl:text-[44px]">
          Design beautiful spaces.
          <br />
          <span className="text-soft-strong">Deliver every project on time.</span>
        </h2>
        <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-white/90">
          One workspace for clients, site progress, material requests and handovers — built for the
          way {BRAND.name} works.
        </p>
      </div>

      <ul className="relative grid gap-4 px-12 pb-14 xl:grid-cols-2 xl:px-16">
        {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
          <li
            key={title}
            className="rounded-2xl bg-white/[0.08] p-5 ring-1 ring-white/15 backdrop-blur-sm"
          >
            <span className="flex size-10 items-center justify-center rounded-xl bg-white/15 text-soft-strong">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <p className="mt-3 font-semibold">{title}</p>
            <p className="mt-1 text-sm leading-relaxed text-white/90">{text}</p>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <main className="flex flex-col px-4 py-8 sm:px-8">
        <div className="flex flex-1 items-center justify-center py-6">
          <div className="w-full max-w-[440px]">{children}</div>
        </div>
        <p className="text-center text-sm text-muted">
          © {new Date().getFullYear()} {BRAND.name}
        </p>
      </main>
      <BrandPanel />
    </div>
  );
}

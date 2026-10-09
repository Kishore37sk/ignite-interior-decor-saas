import Image from "next/image";
import Link from "next/link";
import { BRAND } from "@/lib/constants";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  href?: string;
  /** Company logo from Settings → Company (any https URL or site path); falls back to the bundled logo. */
  logoUrl?: string | null;
  /** Company name used as the logo's accessible name. */
  name?: string;
};

/** Company logo (default: Ignite, 819×247 source) linking to the dashboard. */
export function BrandLogo({ className, href = "/dashboard", logoUrl = null, name = BRAND.name }: BrandLogoProps) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        className,
      )}
    >
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary owner-provided logo URL
        <img src={logoUrl} alt={name} className="h-11 w-auto max-w-[180px] object-contain" referrerPolicy="no-referrer" />
      ) : (
        <Image src={BRAND.logo} alt={name} width={164} height={49} priority className="h-11 w-auto" />
      )}
    </Link>
  );
}

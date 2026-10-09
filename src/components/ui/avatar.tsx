import type { ComponentPropsWithRef } from "react";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const SIZES = {
  xs: "size-6 text-[10px]",
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-12 text-base",
  xl: "size-16 text-xl",
  "2xl": "size-24 text-3xl",
} as const;

export type AvatarSize = keyof typeof SIZES;

/** Soft brand-adjacent palettes; the deep variant mirrors TeamHub's "ER" initials avatar. */
const PALETTES = [
  "bg-soft text-deep",
  "bg-avatar-mint text-success-text",
  "bg-deep text-white",
  "bg-warning-bg text-warning-text",
  "bg-info-bg text-info-text",
  "bg-avatar-violet text-avatar-violet-text",
  "bg-avatar-rose text-avatar-rose-text",
  "bg-lime/30 text-deep",
] as const;

/** Stable palette index for a name (FNV-1a hash) so a person always gets the same colour. */
export function avatarPaletteIndex(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return Math.abs(hash) % PALETTES.length;
}

export type AvatarProps = Omit<ComponentPropsWithRef<"span">, "children"> & {
  name: string | null | undefined;
  src?: string | null;
  size?: AvatarSize;
  /** Seed for the colour when names may collide (e.g. the user id). */
  colorSeed?: string;
  /** When the name is shown next to the avatar, hide it from assistive tech. */
  decorative?: boolean;
};

/** Photo avatar, or initials on a deterministic soft colour. */
export function Avatar({ name, src, size = "md", colorSeed, decorative = false, className, ...props }: AvatarProps) {
  const label = name?.trim() || "Unknown user";
  const palette = PALETTES[avatarPaletteIndex(colorSeed ?? label)];

  return (
    <span
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? true : undefined}
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold leading-none",
        SIZES[size],
        src ? "bg-surface-sunken" : palette,
        className,
      )}
      {...props}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- user uploads come from signed/remote URLs
        <img src={src} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
      ) : (
        <span aria-hidden="true">{initials(label)}</span>
      )}
    </span>
  );
}

export type AvatarGroupProps = {
  people: readonly { id: string; name: string; src?: string | null }[];
  max?: number;
  size?: AvatarSize;
  className?: string;
};

/** Overlapping avatars with a "+N" counter (TeamHub schedule cards). */
export function AvatarGroup({ people, max = 3, size = "sm", className }: AvatarGroupProps) {
  const visible = people.slice(0, max);
  const extra = people.length - visible.length;
  return (
    <div className={cn("flex items-center -space-x-2", className)}>
      {visible.map((person) => (
        <Avatar
          key={person.id}
          name={person.name}
          src={person.src}
          size={size}
          colorSeed={person.id}
          className="ring-2 ring-surface"
        />
      ))}
      {extra > 0 ? (
        <span
          className={cn(
            "relative inline-flex shrink-0 items-center justify-center rounded-full bg-deep font-semibold text-white ring-2 ring-surface",
            SIZES[size],
          )}
          aria-label={`${extra} more`}
        >
          +{extra}
        </span>
      ) : null}
    </div>
  );
}

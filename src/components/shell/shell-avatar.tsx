import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

type ShellAvatarProps = {
  name: string;
  src: string | null;
  size?: "sm" | "md";
  className?: string;
};

/** Compact avatar used inside the shell (image when available, else initials). */
export function ShellAvatar({ name, src, size = "md", className }: ShellAvatarProps) {
  const dimension = size === "sm" ? "size-8 text-xs" : "size-10 text-sm";
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-deep font-semibold text-white ring-2 ring-white",
        dimension,
        className,
      )}
      aria-hidden="true"
    >
      {src ? (
        // Avatars are small, user-supplied URLs (Supabase storage); next/image adds no value here.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        initials(name)
      )}
    </span>
  );
}

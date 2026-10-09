import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar, type AvatarSize } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export type UserAvatarProps = {
  name: string | null | undefined;
  avatarUrl?: string | null;
  /** Secondary line, e.g. employee id ("SM001") or role. */
  subtitle?: ReactNode;
  /** Stable colour seed (user id). */
  userId?: string;
  size?: AvatarSize;
  /** Link the name to a profile/detail page. */
  href?: string;
  /** Avatar only (name kept as the accessible label). */
  hideName?: boolean;
  className?: string;
};

/** Avatar + name + subtitle, as in TeamHub table cells ("Olivia Mason / EMP-0234"). */
export function UserAvatar({
  name,
  avatarUrl,
  subtitle,
  userId,
  size = "md",
  href,
  hideName = false,
  className,
}: UserAvatarProps) {
  const displayName = name?.trim() || "Unassigned";

  if (hideName) {
    return <Avatar name={displayName} src={avatarUrl} size={size} colorSeed={userId} className={className} />;
  }

  const nameNode = href ? (
    <Link
      href={href}
      className="truncate rounded-sm font-medium text-text hover:text-primary-strong hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {displayName}
    </Link>
  ) : (
    <span className="truncate font-medium text-text">{displayName}</span>
  );

  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <Avatar name={displayName} src={avatarUrl} size={size} colorSeed={userId} decorative />
      <div className="flex min-w-0 flex-col text-sm leading-snug">
        {nameNode}
        {subtitle ? <span className="truncate text-xs text-muted">{subtitle}</span> : null}
      </div>
    </div>
  );
}

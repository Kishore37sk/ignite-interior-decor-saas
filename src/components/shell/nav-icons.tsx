import {
  Activity,
  ChartColumn,
  ClipboardList,
  Contact,
  FolderKanban,
  HardHat,
  LayoutDashboard,
  Package,
  Plus,
  Settings,
  ShieldCheck,
  UserRound,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { NavIconName } from "@/lib/navigation";

export const NAV_ICONS: Record<NavIconName, LucideIcon> = {
  LayoutDashboard,
  Contact,
  FolderKanban,
  HardHat,
  ShieldCheck,
  ClipboardList,
  Package,
  ChartColumn,
  Activity,
  UsersRound,
  Settings,
  UserRound,
  Plus,
};

export function NavIcon({ name, className }: { name: NavIconName; className?: string }) {
  const Icon = NAV_ICONS[name];
  return <Icon className={className} aria-hidden="true" />;
}

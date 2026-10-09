import type { AppRole, UserStatus } from "@/types/database";

/** Serializable user shape passed from server pages to the user-management client components. */
export type ManagedUser = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: AppRole | null;
  employee_id: string | null;
  status: UserStatus;
  joining_date: string | null;
};

export function toManagedUser(profile: ManagedUser): ManagedUser {
  return {
    id: profile.id,
    full_name: profile.full_name,
    email: profile.email,
    phone: profile.phone,
    role: profile.role,
    employee_id: profile.employee_id,
    status: profile.status,
    joining_date: profile.joining_date,
  };
}

/** Detail page of a staff user, or null for the owner / role-less accounts. */
export function profileHref(user: Pick<ManagedUser, "id" | "role">): string | null {
  if (user.role === "site_manager") return `/site-managers/${user.id}`;
  if (user.role === "admin") return `/admins/${user.id}`;
  return null;
}

import type { AppRole } from "@/types/database";

/** Serializable user summary passed from the (app) layout to client shell parts. */
export type ShellUser = {
  id: string;
  fullName: string;
  email: string;
  role: AppRole;
  employeeId: string | null;
  avatarUrl: string | null;
};

/** Notification fields the panel needs. */
export type ShellNotification = {
  id: string;
  title: string;
  message: string | null;
  type: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

import { z } from "zod";
import { optionalPhone, requiredText } from "@/lib/validation/common";

/** Fields a user may change on their own profile (role/email/employee ID are owner-only). */
export const ownProfileSchema = z.object({
  full_name: requiredText("Name", 120),
  phone: optionalPhone,
});
export type OwnProfileInput = z.infer<typeof ownProfileSchema>;

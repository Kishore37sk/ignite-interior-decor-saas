import { z } from "zod";
import { optionalEmail, optionalPhone, optionalText, requiredText, uuid } from "@/lib/validation/common";

const optionalUrl = z
  .preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : typeof v === "string" ? v.trim() : v),
    z
      .string()
      .max(500, "URL must be 500 characters or fewer.")
      .refine((v) => {
        try {
          const url = new URL(v);
          return url.protocol === "https:" || url.protocol === "http:" || v.startsWith("/");
        } catch {
          return v.startsWith("/") && !v.startsWith("//");
        }
      }, "Enter a full image URL (https://…) or a site path like /brand/logo.png.")
      .optional(),
  )
  .transform((v) => v ?? null);

export const companySettingsSchema = z.object({
  company_name: requiredText("Company name", 120),
  logo_url: optionalUrl,
  contact_name: optionalText(120, "Contact name"),
  email: optionalEmail,
  phone: optionalPhone,
  address: optionalText(500, "Address"),
});
export type CompanySettingsInput = z.infer<typeof companySettingsSchema>;

export const categoryNameSchema = z.object({
  name: requiredText("Category name", 60),
});

export const categoryIdSchema = uuid;

export const moveCategorySchema = z.object({
  id: uuid,
  direction: z.enum(["up", "down"]),
});

import { z } from "zod";
import { email, password } from "@/lib/validation/common";

export const loginSchema = z.object({
  email,
  password: z.string({ error: "Password is required." }).min(1, "Password is required.").max(200),
  next: z.string().max(2048).optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password,
    confirmPassword: z.string({ error: "Please confirm your password." }),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** Signed-in password change: the current password is re-verified before updating. */
export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string({ error: "Enter your current password." })
      .min(1, "Enter your current password.")
      .max(200),
    password,
    confirmPassword: z.string({ error: "Please confirm your password." }),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

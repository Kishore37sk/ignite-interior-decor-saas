import type { Metadata } from "next";
import { AuthCard } from "../auth-ui";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Forgot your password?"
      description="Enter your work email and we'll send you a link to set a new password."
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}

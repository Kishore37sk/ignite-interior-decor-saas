import type { Metadata } from "next";
import Link from "next/link";
import { getParam, type SearchParamsRecord } from "@/lib/search-params";
import { createClient } from "@/lib/supabase/server";
import { AuthCard, FormAlert, submitClass } from "../auth-ui";
import { RecoveryHashHandler } from "../recovery-hash-handler";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Set a new password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsRecord>;
}) {
  const params = await searchParams;
  const isInvite = getParam(params, "welcome") === "1";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AuthCard title="Link expired" description="This password link is invalid or has already been used.">
        {/* Stock-template links arrive with the session in the URL fragment; pick it up first. */}
        <RecoveryHashHandler>
          <div className="space-y-6">
            <FormAlert>
              For your security, password links can only be used once and expire after a short time.
              Request a new link to continue.
            </FormAlert>
            <Link href="/forgot-password" className={submitClass}>
              Request a new link
            </Link>
          </div>
        </RecoveryHashHandler>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={isInvite ? "Create your password" : "Set a new password"}
      description={
        <>
          {isInvite ? "Welcome aboard! Choose a password for " : "Choose a new password for "}
          <span className="break-all font-semibold text-text">{user.email}</span>.
        </>
      }
    >
      <ResetPasswordForm submitLabel={isInvite ? "Create password & continue" : "Update password"} />
    </AuthCard>
  );
}

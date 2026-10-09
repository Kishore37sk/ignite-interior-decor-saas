import type { Metadata } from "next";
import { safeNextPath } from "@/lib/navigation";
import { getParam, type SearchParamsRecord } from "@/lib/search-params";
import { AuthCard, FormAlert } from "../auth-ui";
import { RecoveryHashHandler } from "../recovery-hash-handler";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

/** Messages for `?error=` codes set by requireUser() and the auth routes. */
const ERROR_NOTICES: Record<string, string> = {
  inactive: "Your account has been deactivated. Contact the owner to regain access.",
  no_access: "Your account doesn't have access to the portal yet. Contact the owner to assign your role.",
  link: "That sign-in link is invalid or has expired. Please request a new one.",
  session: "Your session has expired. Please sign in again.",
};

const INFO_NOTICES: Record<string, string> = {
  signed_out: "You have been signed out.",
  password_updated: "Your password was updated. Please sign in with your new password.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const params = await searchParams;
  const errorCode = getParam(params, "error");
  const infoCode = getParam(params, "message");
  const rawNext = getParam(params, "next");
  const next = rawNext ? safeNextPath(rawNext) : undefined;

  const notice = errorCode ? (ERROR_NOTICES[errorCode] ?? ERROR_NOTICES.session) : undefined;
  const info = !notice && infoCode ? INFO_NOTICES[infoCode] : undefined;

  return (
    <AuthCard title="Welcome back" description="Sign in to manage your projects, clients and materials.">
      {info ? (
        <div className="mb-5">
          <FormAlert tone="success">{info}</FormAlert>
        </div>
      ) : null}
      {/* A password link whose redirect URL isn't allow-listed falls back to the Site URL (→ /login). */}
      <RecoveryHashHandler target="/reset-password">
        <LoginForm next={next} notice={notice} />
      </RecoveryHashHandler>
    </AuthCard>
  );
}

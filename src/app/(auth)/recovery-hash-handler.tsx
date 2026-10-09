"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Spinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";

const SESSION_TYPES = new Set(["recovery", "invite", "magiclink", "signup"]);

/**
 * Fallback for password links built from Supabase's stock email template
 * (`{{ .ConfirmationURL }}`): GoTrue verifies the token itself and redirects with the
 * session in the URL fragment (`#access_token=…&refresh_token=…&type=recovery`), which the
 * server never sees. This stores that session as cookies and reloads `target`
 * (default: the current page without the fragment) so the server can read it.
 *
 * The recommended token-hash template (README → Supabase Setup) is handled server-side
 * by `/auth/confirm` and never reaches this code.
 */
export function RecoveryHashHandler({ children, target }: { children: ReactNode; target?: string }) {
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    const raw = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
    if (!raw) return;
    const hash = new URLSearchParams(raw);
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    const type = hash.get("type") ?? "";
    const current = `${window.location.pathname}${window.location.search}`;
    if (!accessToken || !refreshToken || !SESSION_TYPES.has(type)) {
      // e.g. #error=access_denied&error_code=otp_expired — drop the fragment and show the page as is.
      if (hash.has("error") || hash.has("error_code")) window.history.replaceState(null, "", current);
      return;
    }

    let cancelled = false;
    const run = async () => {
      setVerifying(true);
      try {
        const { error } = await createClient().auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (error) throw error;
        let destination = target ?? current;
        if (type === "invite" && destination.startsWith("/reset-password") && !destination.includes("welcome=1")) {
          destination = "/reset-password?welcome=1";
        }
        // Full navigation (not router.replace) so the server renders with the new session cookie.
        window.location.replace(destination);
      } catch {
        if (cancelled) return;
        window.history.replaceState(null, "", current);
        setVerifying(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [target]);

  if (verifying) {
    return (
      <div role="status" className="flex flex-col items-center gap-3 py-6 text-sm text-muted">
        <Spinner size="lg" label="Verifying your link" />
        Verifying your link…
      </div>
    );
  }
  return <>{children}</>;
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthPanel } from "@/components/auth-panel";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Sign up" };

type Props = {
  searchParams: Promise<{ next?: string; error?: string }>;
};

/**
 * Create an account with a Google account.
 *
 * Deliberately the same OAuth flow as /login: Google returns an identity either
 * way, and the callback upserts the profile row. A first-time visitor lands on a
 * fresh profile, a returning one on the existing profile - there is no separate
 * "register" endpoint to keep in sync, and no password to store or reset.
 */
export default async function SignupPage({ searchParams }: Props) {
  const params = await searchParams;

  // Same-origin relative paths only - see the matching check in /api/auth/google.
  const next =
    params.next && params.next.startsWith("/") && !params.next.startsWith("//")
      ? params.next
      : "/";

  if (await getCurrentUser()) redirect(next);

  return <AuthPanel mode="signup" next={next} error={params.error} />;
}
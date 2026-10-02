import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthPanel } from "@/components/auth-panel";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Log in" };

type Props = {
  searchParams: Promise<{ next?: string; error?: string }>;
};

/**
 * Sign in for a shopper who already has an account.
 *
 * This also doubles as the OAuth error surface: /api/auth/callback/google
 * bounces back here with ?error=... rather than rendering a stack trace,
 * because that redirect is driven entirely by Google and there is nobody to
 * click a retry button. /signup is the same panel in different words.
 */
export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;

  // Same-origin relative paths only - see the matching check in /api/auth/google.
  const next =
    params.next && params.next.startsWith("/") && !params.next.startsWith("//")
      ? params.next
      : "/";

  // Already signed in? Go straight to where they were headed.
  if (await getCurrentUser()) redirect(next);

  return <AuthPanel mode="signin" next={next} error={params.error} />;
}

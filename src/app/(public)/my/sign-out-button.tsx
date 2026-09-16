"use client";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useConstituentSignOut } from "@/lib/constituent/use-sign-out";

/**
 * Sign out, at the foot of `/my`.
 *
 * Kept after #1175 gave the site header the same action: this is where someone
 * who came to read their record finishes, and the header control is for the
 * other twenty pages. The behaviour itself -- local scope, and why -- lives in
 * `useConstituentSignOut`.
 */
export function SignOutButton() {
  const { signOut, isSigningOut } = useConstituentSignOut();

  return (
    <Button variant="outline" onClick={signOut} disabled={isSigningOut}>
      {isSigningOut ? <Spinner /> : null}
      {isSigningOut ? "Signing out..." : "Sign out"}
    </Button>
  );
}

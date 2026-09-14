"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { signOutAndRedirect } from "@/lib/auth/sign-out";
import { LogoutConfirmDialog } from "./logout-confirm-dialog";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";

export function LogoutButton() {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleLogout() {
    setIsSigningOut(true);
    await signOutAndRedirect(router);
  }

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            onClick={() => setConfirmOpen(true)}
            disabled={isSigningOut}
            tooltip={isSigningOut ? "Signing out..." : "Log out"}
          >
            <LogOut />
            <span>
              {isSigningOut ? (
                <>
                  <Spinner /> Signing out...
                </>
              ) : (
                "Log out"
              )}
            </span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>

      <LogoutConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={handleLogout}
      />
    </>
  );
}

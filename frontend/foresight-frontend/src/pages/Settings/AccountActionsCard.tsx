/**
 * Account Actions card — sign-out button with toast-on-failure handling.
 * Owns its own `isSigningOut` state.
 *
 * @module pages/Settings/AccountActionsCard
 */

import { useState } from "react";
import { useAuthContext } from "../../hooks/useAuthContext";
import { LoadingButton } from "../../components/ui/LoadingButton";
import { useToast } from "../../components/ui/Toast";
import { SettingsCard } from "./SettingsCard";

export function AccountActionsCard() {
  const { signOut } = useAuthContext();
  const { pushToast } = useToast();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Failed to sign out", {
        variant: "error",
      });
      setIsSigningOut(false);
    }
  };

  return (
    <SettingsCard title="Account Actions">
      <div className="space-y-4">
        <LoadingButton
          onClick={handleSignOut}
          variant="danger"
          loading={isSigningOut}
          loadingText="Signing out..."
          className="w-full"
        >
          Sign Out
        </LoadingButton>
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
          Sign out of your Foresight account. You'll need to sign in again to
          access the system.
        </p>
      </div>
    </SettingsCard>
  );
}

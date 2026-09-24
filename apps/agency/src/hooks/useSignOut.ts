import { useSessionStore } from "@/state/session";
import { signOutAction } from "@/actions/sign-out.action";
import { toast } from "sonner";
import { useCsrfToken } from "@/components/csrf-provider";

const useSignOut = () => {
  const clearSession = useSessionStore((state) => state.clearSession);
  const csrfToken = useCsrfToken();

  const signOut = async () => {
    toast.loading("Signing out...")
    await signOutAction({ csrfToken });
    clearSession();
    await new Promise((resolve) => setTimeout(resolve, 200));
    toast.dismiss()
    toast.success("Signed out successfully")
  }

  return { signOut }
}

export default useSignOut;

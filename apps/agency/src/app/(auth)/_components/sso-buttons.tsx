import { Button } from "@/components/ui/button"
import { useConfigStore } from "@/state/config";
import Google from "@/icons/google";
import { Skeleton } from "@/components/ui/skeleton";
import { getAuthRouteHref } from "@/utils/auth-redirect";

export default function SSOButtons({
  isSignIn = false,
  redirectPath,
  isGoogleSSOEnabled,
}: {
  isSignIn?: boolean;
  redirectPath?: string;
  isGoogleSSOEnabled?: boolean;
}) {
  const storedIsGoogleSSOEnabled = useConfigStore((state) => state.isGoogleSSOEnabled)
  const resolvedIsGoogleSSOEnabled =
    typeof isGoogleSSOEnabled === "boolean" ? isGoogleSSOEnabled : storedIsGoogleSSOEnabled;

  if (typeof resolvedIsGoogleSSOEnabled !== "boolean") {
    return (
      <Skeleton className="h-11 w-full" />
    )
  }

  const googleAuthHref = getAuthRouteHref("/sso/google", redirectPath);

  return (
    <>
      {resolvedIsGoogleSSOEnabled && (
        <>
          <Button className="h-11 w-full text-sm" asChild size='lg'>
            <a href={googleAuthHref}>
              <Google className="w-[22px] h-[22px] mr-1" />
              {isSignIn ? "Sign in with Google" : "Sign up with Google"}
            </a>
          </Button>
        </>
      )}
    </>
  )
}

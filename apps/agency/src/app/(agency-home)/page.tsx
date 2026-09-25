import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { constructMetadata } from "@/lib/utils";

export const metadata = constructMetadata({
  title: "Vidicy Agency",
  description: "Sign in to the Vidicy agency workspace.",
  alternates: {
    canonical: "/",
  },
});

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <Link href="/sign-in" className={buttonVariants({ variant: "default" })}>
        Login
      </Link>
    </div>
  );
}

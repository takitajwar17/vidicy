import type { Metadata } from "next";
import { Suspense } from "react";

import { getCsrfToken } from "@/infra/csrf";
import { CsrfProvider } from "@/components/csrf-provider";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const csrfToken = await getCsrfToken();
  return (
    <CsrfProvider token={csrfToken}>
      <main className="flex min-h-screen flex-col bg-background">
        {/* Isolate delayed route chunks from the main host during hydration replay. */}
        <Suspense
          fallback={
            <p role="status" className="p-6 text-sm text-muted-foreground">
              Loading account page…
            </p>
          }
        >
          {children}
        </Suspense>
      </main>
    </CsrfProvider>
  );
}

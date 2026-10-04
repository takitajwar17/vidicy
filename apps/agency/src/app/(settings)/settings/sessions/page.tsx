import { Suspense } from "react";
import { SessionsClient } from "./sessions.client";
import { Skeleton } from "@/components/ui/skeleton";
import { getSessionsAction } from "./sessions.action";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Sessions",
  description: "Manage your active sessions",
};

export default async function SessionsPage() {
  const [sessions, error] = await getSessionsAction()

  if (error) {
    return redirect('/')
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
          Sessions
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Devices and browsers currently signed into your account.
        </p>
      </div>
      <Suspense
        fallback={
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[92px] w-full rounded-xl" />
            ))}
          </div>
        }
      >
        <SessionsClient sessions={sessions} />
      </Suspense>
    </div>
  );
}

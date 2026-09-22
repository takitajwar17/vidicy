import type { Metadata } from "next"

import { constructMetadata } from "@/lib/utils"

export const metadata: Metadata = constructMetadata({
  title: "Funding",
  description: "Vidicy is currently in the process of fundraising.",
  alternates: {
    canonical: "/funding",
  },
})

export default function FundingPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-16 text-center">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">
          Funding
        </h1>
        <p className="mt-6 text-base leading-relaxed text-muted-foreground sm:text-lg">
          We are currently in the process of fundraising.
        </p>
      </div>
    </main>
  )
}

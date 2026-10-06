"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

// Pilot access token: BuildwithGeminiXPRIZE2026
const ACCESS_TOKEN = "BuildwithGeminiXPRIZE2026"

export function PilotAccessTokenForm() {
  const [token, setToken] = useState("")

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (token.trim() !== ACCESS_TOKEN) return

    window.location.assign(`/sign-in?access=${encodeURIComponent(token.trim())}`)
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl space-y-3">
      <div className="space-y-1.5">
        <label htmlFor="pilot-access-token" className="text-sm font-semibold text-foreground">
          Do you have an access token?
        </label>
        <p className="text-sm leading-6 text-muted-foreground">
          Enter your token to continue to agency sign-in.
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          id="pilot-access-token"
          name="access-token"
          type="text"
          autoComplete="off"
          placeholder="Enter access token"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          aria-label="Access token"
          required
        />
        <Button type="submit" size="lg" className="shrink-0">
          Continue
        </Button>
      </div>
      {token.length > 0 && token.trim() !== ACCESS_TOKEN ? (
        <p className="text-sm text-destructive" role="alert">
          That access token is not recognised.
        </p>
      ) : null}
    </form>
  )
}

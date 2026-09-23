import { isTurnstileEnabled } from "@/flags"
import { CLOUDFLARE_TURNSTILE_URL } from "@/constants"

interface TurnstileResponse {
  success: boolean
  'error-codes'?: string[]
}

export async function validateTurnstileToken(token: string) {
  if (!(await isTurnstileEnabled())) {
    return true
  }

  const response = await fetch(
    CLOUDFLARE_TURNSTILE_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        secret: process.env.TURNSTILE_SECRET_KEY,
        response: token,
      }),
    }
  )

  const data = await response.json() as TurnstileResponse

  return data.success
}

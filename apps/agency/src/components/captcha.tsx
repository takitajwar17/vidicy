'use client'

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import { FormMessage } from './ui/form';
import { useConfigStore } from '@/state/config';

const Turnstile = dynamic(() => import('@marsidev/react-turnstile').then(mod => mod.Turnstile), {
  ssr: false,
})

type Props = Omit<ComponentProps<typeof Turnstile>, 'siteKey'> & {
  enabled?: boolean
  validationError?: string
}

export const Captcha = ({
  enabled,
  validationError,
  ...props
}: Props) => {
  const storedIsTurnstileEnabled = useConfigStore((state) => state.isTurnstileEnabled)
  const isTurnstileEnabled =
    typeof enabled === 'boolean' ? enabled : storedIsTurnstileEnabled

  return (
    isTurnstileEnabled ? (
      <>
        <Turnstile
          options={{
            size: 'flexible',
            language: 'auto',
          }}
          {...props}
          siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ''}
        />

        {validationError && (
          <FormMessage className="text-destructive mt-2">
            {validationError}
          </FormMessage>
        )}
      </>
    ) : null
  )
}

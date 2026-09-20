"use client"

import * as Accordion from "@radix-ui/react-accordion"
import type { ReactNode, Ref } from "react"
import { cn } from "@/lib/utils"

export type FeaturesAccordionItemProps = {
  children: ReactNode
  className?: string
  ref?: Ref<HTMLDivElement>
} & Accordion.AccordionItemProps

export function FeaturesAccordionItem({ children, className, ref, ...props }: FeaturesAccordionItemProps) {
  return (
    <Accordion.Item
      className={cn("mt-px focus-within:relative focus-within:z-10", className)}
      {...props}
      ref={ref}
    >
      {children}
    </Accordion.Item>
  )
}

export type FeaturesAccordionTriggerProps = {
  children: ReactNode
  className?: string
  ref?: Ref<HTMLButtonElement>
}

export function FeaturesAccordionTrigger({ children, className, ref, ...props }: FeaturesAccordionTriggerProps) {
  return (
    <Accordion.Header className="flex">
      <Accordion.Trigger className={cn("", className)} {...props} ref={ref}>
        {children}
      </Accordion.Trigger>
    </Accordion.Header>
  )
}

export type FeaturesAccordionContentProps = {
  children: ReactNode
  className?: string
  ref?: Ref<HTMLDivElement>
} & Accordion.AccordionContentProps

export function FeaturesAccordionContent({ children, className, ref, ...props }: FeaturesAccordionContentProps) {
  return (
    <Accordion.Content
      className={cn(
        "data-[state=closed]:animate-slide-up data-[state=open]:animate-slide-down",
        className
      )}
      {...props}
      ref={ref}
    >
      <div className="px-5 py-2">{children}</div>
    </Accordion.Content>
  )
}

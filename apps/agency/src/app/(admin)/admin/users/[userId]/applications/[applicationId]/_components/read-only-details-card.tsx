import type { ReactNode } from "react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export function ReadOnlyDetailsCard({
  title,
  description,
  items,
}: {
  title: string
  description: string
  items: Array<{ label: string; value: ReactNode }>
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 text-sm">
          {items.map((item) => (
            <div key={item.label} className="grid gap-1">
              <dt className="text-muted-foreground">{item.label}</dt>
              <dd className="font-medium break-all">{item.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}

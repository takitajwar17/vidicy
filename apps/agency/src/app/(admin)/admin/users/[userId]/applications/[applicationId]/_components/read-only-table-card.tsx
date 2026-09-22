import type { ReactNode } from "react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export interface ReadOnlyTableColumn<T> {
  header: string
  render: (row: T) => ReactNode
  className?: string
}

export function ReadOnlyTableCard<T>({
  title,
  description,
  rows,
  columns,
  count,
  emptyMessage,
}: {
  title: string
  description: string
  rows: T[]
  columns: ReadonlyArray<ReadOnlyTableColumn<T>>
  count?: number
  emptyMessage?: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {title}
          {typeof count === "number" ? ` (${count})` : ""}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {emptyMessage ?? "No records found."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((column, index) => (
                  <TableHead key={`${column.header}-${index}`} className={column.className}>
                    {column.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, rowIndex) => (
                <TableRow key={rowIndex}>
                  {columns.map((column, columnIndex) => (
                    <TableCell key={`${rowIndex}-${column.header}-${columnIndex}`} className={column.className}>
                      {column.render(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

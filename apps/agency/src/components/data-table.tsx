"use client"

import * as React from "react"
import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from "lucide-react"
import type { Route } from "next"
import { useRouter } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  pageCount?: number
  pageIndex?: number
  pageSize?: number
  onPageChange?: (pageIndex: number) => void
  onPageSizeChange?: (pageSize: number) => void
  totalCount?: number
  itemNameSingular?: string
  itemNamePlural?: string
  pageSizeOptions?: number[]
  getRowHref?: (row: TData) => string
  bulkActions?: (selectedIds: string[], clearSelection: () => void) => React.ReactNode
}

export function DataTable<TData extends { id: number | string }, TValue>({
  columns,
  data,
  pageCount,
  pageIndex,
  pageSize,
  onPageChange,
  onPageSizeChange,
  totalCount,
  itemNameSingular = "item",
  itemNamePlural = "items",
  pageSizeOptions = [10, 20, 30, 40, 50],
  getRowHref,
  bulkActions,
}: DataTableProps<TData, TValue>) {
  const router = useRouter()
  const [rowSelection, setRowSelection] = React.useState({})
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [sorting, setSorting] = React.useState<SortingState>([])

  const table = useReactTable({
    data,
    columns,
    pageCount: pageCount ?? -1,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
      pagination: {
        pageIndex: pageIndex ?? 0,
        pageSize: pageSize ?? 10,
      },
    },
    onPaginationChange: (updater) => {
      const current = {
        pageIndex: pageIndex ?? 0,
        pageSize: pageSize ?? 10,
      }
      const next = typeof updater === "function" ? updater(current) : updater
      onPageChange?.(next.pageIndex)
      onPageSizeChange?.(next.pageSize)
    },
    manualPagination: Boolean(onPageChange),
    getRowId: (row) => row.id.toString(),
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  })

  const selectedIds = table.getSelectedRowModel().rows.map((row) => row.id)
  const hasSelection = selectedIds.length > 0

  return (
    <div className="space-y-4">
      {hasSelection && bulkActions ? (
        <div className="flex animate-in flex-col gap-2 rounded-xl border border-border/70 bg-muted/45 p-3 shadow-2xs duration-200 slide-in-from-top-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="secondary" className="h-5 rounded-full px-2 py-0.5 text-xs">
              {selectedIds.length} selected
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => table.resetRowSelection()}
            >
              Clear selection
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {bulkActions(selectedIds, () => table.resetRowSelection())}
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-border/70 bg-card/90 shadow-xs">
        <Table className="min-w-full">
          <TableHeader className="sticky top-0 z-10 bg-muted/65 backdrop-blur">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} colSpan={header.colSpan}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className={cn(
                    "transition-[background-color,color] hover:bg-accent/45",
                    getRowHref && "cursor-pointer",
                  )}
                  onClick={() => {
                    const href = getRowHref?.(row.original)
                    if (href) router.push(href as Route)
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      onClick={(event) => {
                        if (cell.column.id === "select") {
                          event.stopPropagation()
                        }
                      }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-muted-foreground">
          {totalCount !== undefined ? (
            <>
              Total {totalCount} {totalCount === 1 ? itemNameSingular : itemNamePlural}
            </>
          ) : (
            <>
              {table.getFilteredSelectedRowModel().rows.length} of{" "}
              {table.getFilteredRowModel().rows.length} row(s) selected.
            </>
          )}
        </div>
        <div className="flex items-center gap-4 lg:gap-8">
          <div className="flex items-center gap-2">
            <p className="hidden text-sm font-medium sm:block">Rows per page</p>
            <Select
              value={`${table.getState().pagination.pageSize}`}
              onValueChange={(value) => {
                table.setPageSize(Number(value))
              }}
            >
              <SelectTrigger className="h-8 w-[70px] focus-visible:ring-4 focus-visible:ring-primary/15 focus-visible:ring-offset-0">
                <SelectValue placeholder={table.getState().pagination.pageSize} />
              </SelectTrigger>
              <SelectContent side="top">
                {pageSizeOptions.map((option) => (
                  <SelectItem key={option} value={`${option}`}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-center text-sm font-medium">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="hidden h-8 w-8 p-0 focus-visible:ring-4 focus-visible:ring-primary/15 focus-visible:ring-offset-0 lg:flex"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronsLeftIcon className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="h-8 w-8 p-0 focus-visible:ring-4 focus-visible:ring-primary/15 focus-visible:ring-offset-0"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="h-8 w-8 p-0 focus-visible:ring-4 focus-visible:ring-primary/15 focus-visible:ring-offset-0"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <ChevronRightIcon className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="hidden h-8 w-8 p-0 focus-visible:ring-4 focus-visible:ring-primary/15 focus-visible:ring-offset-0 lg:flex"
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
            >
              <ChevronsRightIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

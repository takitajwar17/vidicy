"use client"

import { useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { columns, type User } from "./columns"
import type { getAdminUsersPage } from "@/server/admin-users"

// Dynamic import to code-split the heavy data-table bundle (tanstack-table + dnd-kit)
const DataTable = dynamic(
  () => import("@/components/data-table").then(mod => mod.DataTable),
  { ssr: false }
) as any
import { getUsersAction } from "@/app/(admin)/admin/_actions/get-users.action"
import { 
  bulkDeleteUsersAction, 
  bulkUpdateUserRoleAction, 
  bulkVerifyUserEmailAction,
  previewDeleteUsersAction,
} from "@/app/(admin)/admin/_actions/bulk-actions"
import { useServerAction } from "zsa-react"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { PAGE_SIZE_OPTIONS } from "@/app/(admin)/admin/admin-constants"
import { useQueryState } from "nuqs"
import { Button } from "@/components/ui/button"
import { 
  Trash2, 
  ShieldAlert, 
  User as UserIcon, 
  Download, 
  CheckCircle,
  AlertTriangle,
  ArrowRightLeft,
  Loader2,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ROLES_ENUM } from "@/db/schema"
import { exportToCSV } from "@/lib/csv-export"
import { useCsrfToken } from "@/components/csrf-provider"

type AdminUsersPageData = Awaited<ReturnType<typeof getAdminUsersPage>>

interface UsersTableProps {
  initialData: AdminUsersPageData
  initialEmailFilter: string
  initialPage: string
  initialPageSize: string
}

export function UsersTable({
  initialData,
  initialEmailFilter,
  initialPage,
  initialPageSize,
}: UsersTableProps) {
  const csrfToken = useCsrfToken()
  const [page, setPage] = useQueryState("page", { defaultValue: initialPage })
  const [pageSize, setPageSize] = useQueryState("pageSize", { defaultValue: initialPageSize })
  const [emailFilter, setEmailFilter] = useQueryState("email", { defaultValue: initialEmailFilter })
  const hasUsedInitialData = useRef(false)

  // Delete confirmation dialog state
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean
    userIds: string[]
    clearSelection: (() => void) | null
    preview: { usersToDelete: number; appsToTransfer: number; appsToDelete: number } | null
    loading: boolean
  }>({ open: false, userIds: [], clearSelection: null, preview: null, loading: false })

  const { execute: fetchUsers, data, error, status } = useServerAction(getUsersAction, {
    onError: () => {
      toast.error("Failed to fetch users")
    },
  })

  const { execute: bulkDelete, isPending: isDeleting } = useServerAction(bulkDeleteUsersAction, {
    onSuccess: ({ data }) => {
      if (data.success) {
        const parts = [`Deleted ${data.deleted} user${data.deleted === 1 ? "" : "s"}`]
        if (data.appsTransferred > 0) parts.push(`${data.appsTransferred} app${data.appsTransferred === 1 ? "" : "s"} transferred`)
        if (data.appsDeleted > 0) parts.push(`${data.appsDeleted} app${data.appsDeleted === 1 ? "" : "s"} deleted`)
        toast.success(parts.join(". "))
        if (data.errors.length > 0) {
          toast.warning(`${data.errors.length} error${data.errors.length === 1 ? "" : "s"} during deletion`)
        }
        fetchUsers({ page: parseInt(page), pageSize: parseInt(pageSize), emailFilter })
      } else {
        toast.error(data.message || "Failed to delete users")
      }
      setDeleteDialog(prev => ({ ...prev, open: false }))
    },
    onError: () => {
      toast.error("Failed to delete users")
      setDeleteDialog(prev => ({ ...prev, open: false }))
    }
  })

  const { execute: previewDelete } = useServerAction(previewDeleteUsersAction)

  const { execute: bulkUpdateRole, isPending: isUpdatingRole } = useServerAction(bulkUpdateUserRoleAction, {
    onSuccess: ({ data }) => {
      if (data.success) {
        toast.success(`Successfully updated roles for ${data.count} users`)
        fetchUsers({ page: parseInt(page), pageSize: parseInt(pageSize), emailFilter })
      } else {
        toast.error(data.message || "Failed to update roles")
      }
    },
    onError: () => {
      toast.error("Failed to bulk update roles")
    }
  })

  const { execute: bulkVerify, isPending: isVerifying } = useServerAction(bulkVerifyUserEmailAction, {
    onSuccess: ({ data }) => {
      toast.success(`Successfully verified ${data.count} users`)
      fetchUsers({ page: parseInt(page), pageSize: parseInt(pageSize), emailFilter })
    },
    onError: () => {
      toast.error("Failed to bulk verify users")
    }
  })

  useEffect(() => {
    if (!hasUsedInitialData.current) {
      hasUsedInitialData.current = true
      return
    }

    fetchUsers({ page: parseInt(page), pageSize: parseInt(pageSize), emailFilter })
  }, [fetchUsers, page, pageSize, emailFilter])

  const handlePageChange = (newPage: number) => {
    setPage((newPage + 1).toString()) // Convert from 0-based to 1-based and store as string
  }

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize.toString())
    setPage("1") // Reset to first page when changing page size
  }

  const handleEmailFilterChange = (value: string) => {
    setEmailFilter(value)
    setPage("1") // Reset to first page when filtering
  }

  const handleExport = (selectedIds: string[]) => {
    if (!data) return
    const usersToExport = data.users.filter(u => selectedIds.includes(u.id))
    exportToCSV(usersToExport, `users-export-${new Date().toISOString().split('T')[0]}`)
    toast.success(`Exported ${usersToExport.length} users to CSV`)
  }

  const getRowHref = (user: User) => {
    return `/admin/users/${user.id}`
  }

  const renderBulkActions = (selectedIds: string[], clearSelection: () => void) => {
    const isPending = isDeleting || isUpdatingRole || isVerifying

    return (
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1.5"
          onClick={() => handleExport(selectedIds)}
        >
          <Download className="h-3.5 w-3.5" />
          Export
        </Button>
        
        <div className="h-4 w-px bg-border mx-1" />

        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1.5"
          disabled={isPending}
          onClick={() => {
            bulkVerify({ userIds: selectedIds, csrfToken }).then(() => clearSelection())
          }}
        >
          <CheckCircle className="h-3.5 w-3.5" />
          Verify
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" disabled={isPending}>
              <UserIcon className="h-3.5 w-3.5" />
              Change Role
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => {
              bulkUpdateRole({ userIds: selectedIds, role: ROLES_ENUM.ADMIN, csrfToken }).then(() => clearSelection())
            }}>
              <ShieldAlert className="mr-2 h-4 w-4" />
              Make Admin
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => {
              bulkUpdateRole({ userIds: selectedIds, role: ROLES_ENUM.USER, csrfToken }).then(() => clearSelection())
            }}>
              <UserIcon className="mr-2 h-4 w-4" />
              Make User
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="destructive"
          size="sm"
          className="h-8 text-xs gap-1.5"
          disabled={isPending}
          onClick={async () => {
            setDeleteDialog({ open: true, userIds: selectedIds, clearSelection, preview: null, loading: true })
            const [result] = await previewDelete({ userIds: selectedIds, csrfToken })
            if (result) {
              setDeleteDialog(prev => ({ ...prev, preview: result, loading: false }))
            } else {
              setDeleteDialog(prev => ({ ...prev, loading: false, preview: { usersToDelete: selectedIds.length, appsToTransfer: 0, appsToDelete: 0 } }))
            }
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </Button>
      </div>
    )
  }

  const tableData = data ?? initialData

  return (
    <div className="w-full min-w-0 flex flex-col overflow-hidden">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between flex-shrink-0">
        <div className="space-y-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground">Manage and monitor all user accounts.</p>
        </div>
        <Input
          placeholder="Filter emails..."
          type="search"
          value={emailFilter}
          onChange={(event) => handleEmailFilterChange(event.target.value)}
          className="w-full sm:max-w-sm h-9"
        />
      </div>
      <div className="mt-6 flex-1 min-h-0">
        <div className="space-y-4 h-full">
          {status === 'pending' ? (
            <div className="flex flex-col gap-4">
               {[1, 2, 3, 4, 5].map((i) => (
                 <div key={i} className="h-12 w-full bg-muted animate-pulse rounded-lg" />
               ))}
            </div>
          ) : error ? (
            <div className="p-8 text-center text-destructive bg-destructive/5 rounded-lg border border-destructive/20">
              Error: Failed to fetch users
            </div>
          ) : !tableData ? (
            <div className="p-12 text-center text-muted-foreground bg-muted/5 rounded-lg border border-dashed">
              No users found
            </div>
          ) : (
            <div className="w-full min-w-0">
              <DataTable
                columns={columns}
                data={tableData.users}
                pageCount={tableData.totalPages}
                pageIndex={parseInt(page) - 1}
                pageSize={parseInt(pageSize)}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
                totalCount={tableData.totalCount}
                itemNameSingular="user"
                itemNamePlural="users"
                pageSizeOptions={PAGE_SIZE_OPTIONS}
                getRowHref={getRowHref}
                bulkActions={renderBulkActions}
              />
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation dialog with impact preview */}
      <Dialog open={deleteDialog.open} onOpenChange={(open) => {
        if (!open && !isDeleting) setDeleteDialog(prev => ({ ...prev, open: false }))
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete {deleteDialog.userIds.length} user{deleteDialog.userIds.length === 1 ? "" : "s"}?
            </DialogTitle>
            <DialogDescription>
              This action cannot be undone. All user data will be permanently removed.
            </DialogDescription>
          </DialogHeader>

          {deleteDialog.loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Calculating impact…</span>
            </div>
          ) : deleteDialog.preview && (
            <div className="space-y-3 py-2">
              {deleteDialog.preview.appsToTransfer > 0 && (
                <div className="flex items-start gap-3 rounded-lg border p-3 bg-muted/50">
                  <ArrowRightLeft className="h-4 w-4 mt-0.5 text-blue-500 shrink-0" />
                  <div className="text-sm">
                    <span className="font-medium">{deleteDialog.preview.appsToTransfer} application{deleteDialog.preview.appsToTransfer === 1 ? "" : "s"}</span>
                    {" "}will be transferred to another active agency staff member.
                  </div>
                </div>
              )}
              {deleteDialog.preview.appsToDelete > 0 && (
                <div className="flex items-start gap-3 rounded-lg border border-destructive/30 p-3 bg-destructive/5">
                  <Trash2 className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
                  <div className="text-sm">
                    <span className="font-medium">{deleteDialog.preview.appsToDelete} application{deleteDialog.preview.appsToDelete === 1 ? "" : "s"}</span>
                    {" "}with no remaining active staff owner will be permanently deleted, including documents and review data.
                  </div>
                </div>
              )}
              {deleteDialog.preview.appsToTransfer === 0 && deleteDialog.preview.appsToDelete === 0 && (
                <div className="text-sm text-muted-foreground py-1">
                  No applications are owned by the selected user{deleteDialog.userIds.length === 1 ? "" : "s"}.
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialog(prev => ({ ...prev, open: false }))}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                bulkDelete({ userIds: deleteDialog.userIds, csrfToken }).then(() => {
                  deleteDialog.clearSelection?.()
                })
              }}
              disabled={isDeleting || deleteDialog.loading}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  Deleting…
                </>
              ) : (
                "Delete permanently"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

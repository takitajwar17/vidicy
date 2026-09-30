import { PageHeader } from "@/components/page-header"
import type { Metadata } from "next"
import {
  getPlatformStats,
  getSystemHealth,
  getUsageMetrics,
} from "@/server/admin-stats"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  UsersIcon,
  FileTextIcon,
  MessageSquareIcon,
  ClipboardCheckIcon,
  BarChart3Icon,
  ActivityIcon,
  DatabaseIcon,
  HardDriveIcon,
  ServerIcon,
  LifeBuoyIcon,
  CheckCircle2Icon,
  XCircleIcon,
  AlertTriangleIcon,
  FileUpIcon,
  BrainCircuitIcon,
  GlobeIcon,
  ShieldCheckIcon,
  MailIcon,
  UsersRoundIcon,
  TrendingUpIcon,
  BuildingIcon,
  ScaleIcon,
  ClockIcon,
  LinkIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "System status",
  description: "Platform health, stats, and usage metrics",
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USAGE_EVENT_LABELS: Record<string, string> = {
  "checklist-gen": "Checklists Generated",
  "eval-run": "Evaluations Run",
  "chat-msg": "Chat Messages",
  "doc-upload": "Documents Uploaded",
  "custom-item": "Custom Checklist Items",
}

const USAGE_EVENT_ICONS: Record<string, typeof ClipboardCheckIcon> = {
  "checklist-gen": ClipboardCheckIcon,
  "eval-run": BrainCircuitIcon,
  "chat-msg": MessageSquareIcon,
  "doc-upload": FileUpIcon,
  "custom-item": FileTextIcon,
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function formatPct(value: number): string {
  return `${Math.round(value * 100)}%`
}

function StatusIcon({ status }: { status: "ok" | "degraded" | "down" }) {
  if (status === "ok") return <CheckCircle2Icon className="h-5 w-5 text-status-info" />
  if (status === "degraded") return <AlertTriangleIcon className="h-5 w-5 text-amber-500" />
  return <XCircleIcon className="h-5 w-5 text-red-500" />
}

function HealthBadge({ status }: { status: "healthy" | "degraded" | "unhealthy" }) {
  return (
    <Badge
      variant={status === "healthy" ? "default" : status === "degraded" ? "secondary" : "destructive"}
      className={cn("text-xs", status === "healthy" && "bg-status-info/15 text-status-info border-status-info/25")}
    >
      {status === "healthy" ? "All Systems Operational" : status === "degraded" ? "Partial Degradation" : "System Outage"}
    </Badge>
  )
}

function StatCard({ icon: Icon, label, value, sub }: {
  icon: typeof UsersIcon; label: string; value: number | string; sub?: string
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardDescription className="text-sm font-medium">{label}</CardDescription>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{typeof value === "number" ? value.toLocaleString() : value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  )
}

function SectionHeader({ icon: Icon, title }: { icon: typeof UsersIcon; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon className="h-5 w-5 text-muted-foreground" />
      <h2 className="text-lg font-semibold">{title}</h2>
    </div>
  )
}

function ProgressRow({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <div className={cn("h-2.5 w-2.5 rounded-full", color)} />
          <span>{label}</span>
        </div>
        <span className="text-muted-foreground tabular-nums">{count.toLocaleString()} ({pct}%)</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function DataRow({ label, value, icon: Icon }: { label: string; value: string | number; icon?: typeof UsersIcon }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {Icon && <Icon className="h-4 w-4" />}
        <span>{label}</span>
      </div>
      <span className="text-sm font-semibold tabular-nums">{typeof value === "number" ? value.toLocaleString() : value}</span>
    </div>
  )
}

function RankTable({ rows, labelKey, countKey }: { rows: { [k: string]: string | number }[]; labelKey: string; countKey: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No data yet</p>
  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span className="w-5 text-xs text-muted-foreground font-mono">{i + 1}.</span>
            <span className="truncate max-w-[200px]">{String(row[labelKey])}</span>
          </div>
          <span className="font-semibold tabular-nums">{Number(row[countKey]).toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function StatusPage() {
  const [stats, health, usage] = await Promise.all([
    getPlatformStats(),
    getSystemHealth(),
    getUsageMetrics(),
  ])

  const maxGrowth = Math.max(...stats.growth.daily.map((d) => Math.max(d.users, d.apps)), 1)

  return (
    <>
      <PageHeader items={[
        { href: "/admin", label: "Admin" },
        { href: "/admin/status", label: "System Status" },
      ]} />

      <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col gap-2">
          <div className="flex flex-col gap-6 py-4 md:gap-8 md:py-6">
            <div className="px-4 lg:px-6 flex flex-col gap-10">

              {/* ======== SYSTEM HEALTH ======== */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <ActivityIcon className="h-5 w-5 text-muted-foreground" />
                    <h2 className="text-lg font-semibold">System Health</h2>
                  </div>
                  <HealthBadge status={health.status} />
                </div>
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
                  {([
                    { key: "d1" as const, label: "D1 Database", icon: DatabaseIcon, desc: "Primary SQLite database" },
                    { key: "kv" as const, label: "KV Store", icon: ServerIcon, desc: "Sessions & caching" },
                    { key: "r2" as const, label: "R2 Storage", icon: HardDriveIcon, desc: "Document file storage" },
                  ]).map(({ key, label, icon: CompIcon, desc }) => {
                    const comp = health.components[key]
                    return (
                      <Card key={key}>
                        <CardHeader className="flex flex-row items-center gap-3 pb-2">
                          <CompIcon className="h-5 w-5 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-sm font-medium">{label}</CardTitle>
                            <CardDescription className="text-xs">{desc}</CardDescription>
                          </div>
                          <StatusIcon status={comp.status} />
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>Latency</span>
                            <span className={cn("font-mono", comp.latencyMs > 500 && "text-amber-600 dark:text-amber-400", comp.latencyMs > 2000 && "text-red-600 dark:text-red-400")}>
                              {comp.latencyMs}ms
                            </span>
                          </div>
                          {comp.error && <p className="text-xs text-destructive mt-2 truncate" title={comp.error}>{comp.error}</p>}
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  Last checked: {new Date(health.timestamp).toLocaleString()} · Version: {health.version}
                </p>
              </section>

              {/* ======== 14-DAY GROWTH CHART ======== */}
              <section>
                <SectionHeader icon={TrendingUpIcon} title="14-Day Growth" />
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-end gap-1 h-32">
                      {stats.growth.daily.map((day) => {
                        const userH = maxGrowth > 0 ? (day.users / maxGrowth) * 100 : 0
                        const appH = maxGrowth > 0 ? (day.apps / maxGrowth) * 100 : 0
                        return (
                          <div key={day.date} className="flex-1 flex flex-col items-center gap-0.5 group relative" title={`${day.date}: ${day.users} users, ${day.apps} apps`}>
                            <div className="w-full flex gap-px justify-center" style={{ height: "100%" }}>
                              <div className="w-1/2 flex flex-col justify-end">
                                <div className="bg-primary rounded-t-sm min-h-[2px]" style={{ height: `${Math.max(userH, 2)}%` }} />
                              </div>
                              <div className="w-1/2 flex flex-col justify-end">
                                <div className="bg-status-info rounded-t-sm min-h-[2px]" style={{ height: `${Math.max(appH, 2)}%` }} />
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-xs text-muted-foreground">{stats.growth.daily[0]?.date}</span>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" /> Users</span>
                        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-status-info" /> Apps</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{stats.growth.daily[stats.growth.daily.length - 1]?.date}</span>
                    </div>
                  </CardContent>
                </Card>
              </section>

              {/* ======== USERS ======== */}
              <section>
                <SectionHeader icon={UsersIcon} title="Users" />
                <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
                  <StatCard icon={UsersIcon} label="Total Users" value={stats.users.total} sub={`+${stats.users.newToday} today · +${stats.users.newThisMonth} this month`} />
                  <StatCard icon={ShieldCheckIcon} label="Verified" value={stats.users.verified} sub={`${stats.users.unverified} unverified`} />
                  <StatCard icon={MailIcon} label="Password Auth" value={stats.users.withPassword} />
                  <StatCard icon={GlobeIcon} label="Google SSO" value={stats.users.withGoogle} />
                </div>

                <div className="grid gap-4 grid-cols-1 lg:grid-cols-2 mt-4">
                  <Card>
                    <CardHeader><CardTitle className="text-sm font-medium">Auth Method Distribution</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      <ProgressRow label="Email / Password" count={stats.users.withPassword} total={stats.users.total} color="bg-blue-500" />
                      <ProgressRow label="Google SSO" count={stats.users.withGoogle} total={stats.users.total} color="bg-red-500" />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader><CardTitle className="text-sm font-medium">Recent Signups</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {stats.users.recentSignups.map((u) => (
                          <div key={u.id} className="flex items-center justify-between text-sm">
                            <div className="truncate max-w-[200px]">
                              <span className="font-medium">{u.firstName || "—"}</span>
                              <span className="text-muted-foreground ml-2">{u.email}</span>
                            </div>
                            <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                              {u.createdAt instanceof Date ? u.createdAt.toLocaleDateString() : "—"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="mt-2 text-xs text-muted-foreground">{stats.users.admins} admin{stats.users.admins !== 1 ? "s" : ""}</div>
              </section>

              {/* ======== APPLICATIONS ======== */}
              <section>
                <SectionHeader icon={FileTextIcon} title="Visa Applications" />
                <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
                  <StatCard icon={FileTextIcon} label="Active Apps" value={stats.applications.active} sub={`${stats.applications.trashed} trashed`} />
                  <StatCard icon={ClipboardCheckIcon} label="With Checklist" value={stats.applications.withChecklist} sub={formatPct(stats.applications.active > 0 ? stats.applications.withChecklist / stats.applications.active : 0) + " of active"} />
                  <StatCard icon={BrainCircuitIcon} label="With Evaluation" value={stats.applications.withEvaluation} sub={formatPct(stats.applications.active > 0 ? stats.applications.withEvaluation / stats.applications.active : 0) + " of active"} />
                  <StatCard icon={ScaleIcon} label="Avg Readiness" value={stats.applications.avgReadinessScore != null ? `${stats.applications.avgReadinessScore}/100` : "—"} />
                  <StatCard icon={CheckCircle2Icon} label="Outcomes" value={`${stats.applications.outcomes.approved}A / ${stats.applications.outcomes.rejected}R`} sub={`${stats.applications.outcomes.pending} pending`} />
                </div>

                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mt-4">
                  {/* Status breakdown */}
                  <Card>
                    <CardHeader><CardTitle className="text-sm font-medium">By Status</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      {([
                        { key: "draft", label: "Draft", color: "bg-slate-500" },
                        { key: "in_progress", label: "In Progress", color: "bg-primary" },
                        { key: "ready", label: "Ready", color: "bg-status-info" },
                        { key: "submitted", label: "Submitted", color: "bg-sky-500" },
                      ]).map(({ key, label, color }) => (
                        <ProgressRow key={key} label={label} count={stats.applications.byStatus[key] ?? 0} total={stats.applications.active} color={color} />
                      ))}
                    </CardContent>
                  </Card>

                  {/* Risk level */}
                  <Card>
                    <CardHeader><CardTitle className="text-sm font-medium">By Risk Level</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      {([
                        { key: "low", label: "Low Risk", color: "bg-status-info" },
                        { key: "medium", label: "Medium Risk", color: "bg-amber-500" },
                        { key: "high", label: "High Risk", color: "bg-red-500" },
                      ]).map(({ key, label, color }) => {
                        const riskTotal = Object.values(stats.applications.byRiskLevel).reduce((a, b) => a + b, 0)
                        return <ProgressRow key={key} label={label} count={stats.applications.byRiskLevel[key] ?? 0} total={riskTotal} color={color} />
                      })}
                    </CardContent>
                  </Card>

                  {/* Top destinations */}
                  <Card>
                    <CardHeader><CardTitle className="text-sm font-medium">Top Destinations</CardTitle></CardHeader>
                    <CardContent>
                      <RankTable rows={stats.applications.topDestinations} labelKey="country" countKey="count" />
                    </CardContent>
                  </Card>

                  {/* Top visa types */}
                  <Card>
                    <CardHeader><CardTitle className="text-sm font-medium">Top Visa Types</CardTitle></CardHeader>
                    <CardContent>
                      <RankTable rows={stats.applications.topVisaTypes} labelKey="visaType" countKey="count" />
                    </CardContent>
                  </Card>
                </div>

                {/* Recent apps */}
                <Card className="mt-4">
                  <CardHeader><CardTitle className="text-sm font-medium">Recent Applications</CardTitle></CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-muted-foreground border-b">
                            <th className="pb-2 font-medium">Name</th>
                            <th className="pb-2 font-medium">Destination</th>
                            <th className="pb-2 font-medium">Visa Type</th>
                            <th className="pb-2 font-medium">Status</th>
                            <th className="pb-2 font-medium text-right">Created</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stats.applications.recentApps.map((app) => (
                            <tr key={app.id} className="border-b last:border-0">
                              <td className="py-2 truncate max-w-[160px]">{app.name || "Untitled"}</td>
                              <td className="py-2">{app.destinationCountry || "—"}</td>
                              <td className="py-2">{app.visaType || "—"}</td>
                              <td className="py-2">
                                <Badge variant="outline" className="text-xs capitalize">{app.status.replace("_", " ")}</Badge>
                              </td>
                              <td className="py-2 text-right text-muted-foreground tabular-nums">
                                {app.createdAt instanceof Date ? app.createdAt.toLocaleDateString() : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </section>

              {/* ======== APPLICANTS ======== */}
              <section>
                <SectionHeader icon={UsersRoundIcon} title="Applicants" />
                <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
                  <StatCard icon={UsersRoundIcon} label="Total Applicants" value={stats.applicants.total} />
                  <StatCard icon={CheckCircle2Icon} label="Prior Approval" value={stats.applicants.withPriorApproval} sub={formatPct(stats.applicants.total > 0 ? stats.applicants.withPriorApproval / stats.applicants.total : 0)} />
                  <StatCard icon={XCircleIcon} label="Prior Rejection" value={stats.applicants.withPriorRejection} sub={formatPct(stats.applicants.total > 0 ? stats.applicants.withPriorRejection / stats.applicants.total : 0)} />
                  <Card>
                    <CardHeader className="pb-2"><CardDescription className="text-sm font-medium">By Relationship</CardDescription></CardHeader>
                    <CardContent className="space-y-1.5">
                      {Object.entries(stats.applicants.byRelationship).sort((a, b) => b[1] - a[1]).map(([rel, count]) => (
                        <div key={rel} className="flex items-center justify-between text-sm">
                          <span className="capitalize text-muted-foreground">{rel}</span>
                          <span className="font-semibold tabular-nums">{count}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              </section>

              {/* ======== DOCUMENTS & PIPELINE ======== */}
              <section>
                <SectionHeader icon={FileUpIcon} title="Documents & Processing Pipeline" />
                <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
                  <StatCard icon={FileUpIcon} label="Total Documents" value={stats.documents.total} />
                  <StatCard icon={HardDriveIcon} label="Total Storage" value={formatBytes(stats.documents.totalSizeBytes)} sub={`Avg: ${formatBytes(stats.documents.avgSizeBytes)}`} />
                  <StatCard icon={DatabaseIcon} label="Vector Chunks" value={stats.documents.totalChunks} sub={stats.documents.total > 0 ? `~${Math.round(stats.documents.totalChunks / stats.documents.total)} per doc` : "—"} />
                  <StatCard icon={CheckCircle2Icon} label="Pipeline Success" value={formatPct(stats.documents.pipelineSuccessRate)} />
                  <StatCard icon={AlertTriangleIcon} label="Failed Extraction" value={stats.documents.byExtractionStatus["failed"] ?? 0} />
                </div>
                <Card className="mt-4">
                  <CardHeader><CardTitle className="text-sm font-medium">Extraction Status</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    {([
                      { status: "completed", label: "Completed", color: "bg-status-info" },
                      { status: "queued", label: "Queued", color: "bg-amber-500" },
                      { status: "extracting", label: "Extracting", color: "bg-sky-500" },
                      { status: "partial", label: "Partial", color: "bg-orange-500" },
                      { status: "failed", label: "Failed", color: "bg-red-500" },
                      { status: "skipped", label: "Skipped", color: "bg-slate-400" },
                      { status: "unsupported", label: "Unsupported", color: "bg-slate-500" },
                    ]).map(({ status, label, color }) => (
                      <ProgressRow key={status} label={label} count={stats.documents.byExtractionStatus[status] ?? 0} total={stats.documents.total} color={color} />
                    ))}
                  </CardContent>
                </Card>
              </section>

              {/* ======== REVIEW EVALUATIONS ======== */}
              <section>
                <SectionHeader icon={BrainCircuitIcon} title="Review Evaluations" />
                <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
                  <StatCard icon={BrainCircuitIcon} label="Total Evaluations" value={stats.evaluations.total} />
                  <StatCard icon={ScaleIcon} label="Avg Score" value={stats.evaluations.avgScore != null ? `${stats.evaluations.avgScore}/100` : "—"} />
                  <Card>
                    <CardHeader className="pb-2"><CardDescription className="text-sm font-medium">By Risk Level</CardDescription></CardHeader>
                    <CardContent className="space-y-2">
                      {([
                        { key: "low", label: "Low", color: "bg-status-info" },
                        { key: "medium", label: "Medium", color: "bg-amber-500" },
                        { key: "high", label: "High", color: "bg-red-500" },
                      ]).map(({ key, label, color }) => {
                        const riskTotal = Object.values(stats.evaluations.byRiskLevel).reduce((a, b) => a + b, 0)
                        return <ProgressRow key={key} label={label} count={stats.evaluations.byRiskLevel[key] ?? 0} total={riskTotal} color={color} />
                      })}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2"><CardDescription className="text-sm font-medium">Score Confidence</CardDescription></CardHeader>
                    <CardContent className="space-y-2">
                      {([
                        { key: "high", label: "High", color: "bg-status-info" },
                        { key: "moderate", label: "Moderate", color: "bg-amber-500" },
                        { key: "low", label: "Low", color: "bg-red-500" },
                      ]).map(({ key, label, color }) => {
                        const confTotal = Object.values(stats.evaluations.byConfidence).reduce((a, b) => a + b, 0)
                        return <ProgressRow key={key} label={label} count={stats.evaluations.byConfidence[key] ?? 0} total={confTotal} color={color} />
                      })}
                    </CardContent>
                  </Card>
                </div>
              </section>

              {/* ======== CHAT & CHECKLISTS ======== */}
              <section>
                <SectionHeader icon={MessageSquareIcon} title="Atlas Chat & Checklists" />
                <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-7">
                  <StatCard icon={MessageSquareIcon} label="Chat Messages" value={stats.chatMessages.total} sub={`${stats.chatMessages.byUser} user · ${stats.chatMessages.byAssistant} assistant`} />
                  <StatCard icon={LinkIcon} label="Apps Using Chat" value={stats.chatMessages.appsWithChat} sub={formatPct(stats.applications.active > 0 ? stats.chatMessages.appsWithChat / stats.applications.active : 0) + " of apps"} />
                  <StatCard icon={ClipboardCheckIcon} label="Checklist Items" value={stats.checklists.total} sub={`${stats.checklists.required} required · ${stats.checklists.optional} optional`} />
                  {([
                    { key: "pending", label: "Pending", icon: ClockIcon },
                    { key: "uploaded", label: "Uploaded", icon: FileUpIcon },
                    { key: "approved", label: "Approved", icon: CheckCircle2Icon },
                    { key: "rejected", label: "Rejected", icon: XCircleIcon },
                  ] as const).map(({ key, label, icon }) => (
                    <StatCard key={key} icon={icon} label={label} value={stats.checklists.byStatus[key] ?? 0} />
                  ))}
                </div>
              </section>

              {/* ======== SUPPORT ======== */}
              <section>
                <SectionHeader icon={LifeBuoyIcon} title="Support Tickets" />
                <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
                  <StatCard icon={LifeBuoyIcon} label="Total Tickets" value={stats.support.total} />
                  <StatCard icon={AlertTriangleIcon} label="Open" value={stats.support.open} />
                  <StatCard icon={ActivityIcon} label="In Progress" value={stats.support.inProgress} />
                  <StatCard icon={CheckCircle2Icon} label="Resolved / Closed" value={stats.support.resolved + stats.support.closed} sub={`${stats.support.resolved} resolved · ${stats.support.closed} closed`} />
                  <StatCard icon={ClockIcon} label="Avg Resolution" value={stats.support.avgResolutionHours != null ? `${stats.support.avgResolutionHours}h` : "—"} />
                </div>
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 mt-4">
                  <Card>
                    <CardHeader><CardTitle className="text-sm font-medium">By Category</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      {Object.entries(stats.support.byCategory).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
                        <ProgressRow key={cat} label={cat.replace("_", " ")} count={count} total={stats.support.total} color="bg-blue-500" />
                      ))}
                      {Object.keys(stats.support.byCategory).length === 0 && <p className="text-sm text-muted-foreground">No tickets yet</p>}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader><CardTitle className="text-sm font-medium">By Priority</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      {([
                        { key: "high", label: "High", color: "bg-red-500" },
                        { key: "medium", label: "Medium", color: "bg-amber-500" },
                        { key: "low", label: "Low", color: "bg-status-info" },
                      ]).map(({ key, label, color }) => (
                        <ProgressRow key={key} label={label} count={stats.support.byPriority[key] ?? 0} total={stats.support.total} color={color} />
                      ))}
                    </CardContent>
                  </Card>
                </div>
              </section>

              {/* ======== AGENCY TEAM & ENTERPRISE ======== */}
              <section>
                <SectionHeader icon={UsersRoundIcon} title="Agency Team & Enterprise" />
                <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
                  <StatCard icon={UsersRoundIcon} label="Staff" value={stats.agencyTeam.totalStaff} sub={`${stats.agencyTeam.activeStaff} active`} />
	                  <StatCard icon={UsersRoundIcon} label="Linked Staff" value={stats.agencyTeam.linkedStaff} sub="Signed in at least once" />
                  <StatCard icon={BuildingIcon} label="Enterprise Inquiries" value={stats.enterprise.total} />
                  {Object.entries(stats.enterprise.byStatus).map(([status, count]) => (
                    <StatCard key={status} icon={BuildingIcon} label={`Enterprise: ${status}`} value={count} />
                  ))}
                </div>
              </section>

              {/* ======== USAGE METRICS ======== */}
              <section>
                <SectionHeader icon={BarChart3Icon} title="Usage Metrics (KV Tracked)" />
                <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-medium">Today</CardTitle>
                      <CardDescription className="text-xs">
                        {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {Object.entries(USAGE_EVENT_LABELS).map(([event, label]) => (
                        <DataRow key={event} label={label} value={usage.today[event] ?? 0} icon={USAGE_EVENT_ICONS[event]} />
                      ))}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-medium">This Month</CardTitle>
                      <CardDescription className="text-xs">
                        {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long" })}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {Object.entries(USAGE_EVENT_LABELS).map(([event, label]) => (
                        <DataRow key={event} label={label} value={usage.thisMonth[event] ?? 0} icon={USAGE_EVENT_ICONS[event]} />
                      ))}
                    </CardContent>
                  </Card>
                </div>
              </section>

              <div className="pb-8" />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

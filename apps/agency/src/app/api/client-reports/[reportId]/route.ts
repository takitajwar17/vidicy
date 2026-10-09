import "server-only";
import { getClientReport } from "@/server/client-reports";

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );
}
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reportId: string }> },
) {
  try {
    const { reportId } = await params;
    const { report, application, isStale } = await getClientReport({ reportId });
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Client document report</title><style>body{font-family:system-ui,sans-serif;max-width:760px;margin:40px auto;padding:20px;line-height:1.6}li{break-inside:avoid;margin-bottom:24px}p{white-space:pre-wrap}</style></head><body><h1>Client document report</h1><p>Case ${escapeHtml(application.caseNumber ?? application.id)} · ${escapeHtml(application.clientName ?? "Client")}</p><p>${escapeHtml(application.destinationCountry)} · ${escapeHtml(application.visaType)}</p>${isStale ? "<p><strong>Out of date: historical copy.</strong></p>" : ""}<p>${escapeHtml(report.summary)}</p><ol>${report.actionItems.map((item) => `<li><h2>${escapeHtml(item.title)}</h2><p>${escapeHtml(item.severity)} priority</p><p>${escapeHtml(item.detail)}</p></li>`).join("")}</ol><p>This report supports document preparation. It does not guarantee a visa decision. Send corrections to your agency reviewer.</p></body></html>`;
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="client-report-${report.id.replace(/[^a-zA-Z0-9_-]/g, "")}.html"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'",
      },
    });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    return new Response("Report unavailable", {
      status: ["NOT_AUTHORIZED", "FORBIDDEN"].includes(code)
        ? 403
        : code === "NOT_FOUND"
          ? 404
          : 500,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}

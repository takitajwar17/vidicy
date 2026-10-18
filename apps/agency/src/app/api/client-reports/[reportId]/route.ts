import "server-only";
import { getClientReport } from "@/server/client-reports";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reportId: string }> },
) {
  try {
    const { reportId } = await params;
    const data = await getClientReport({ reportId });
    const { renderClientReportPDF } = await import("@/server/client-report-pdf");
    const pdf = await renderClientReportPDF(data);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="client-report-${data.report.id.replace(/[^a-zA-Z0-9_-]/g, "")}.pdf"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
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

import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { getClientReport } from "@/server/client-reports";
import {
  CLIENT_REPORT_DELIVERY_STATUS_META,
  CLIENT_REPORT_REVIEW_NOTE,
  getDisplayCaseNumber,
} from "@/lib/agency-workflow";

Font.register({
  family: "Manrope",
  fonts: [
    {
      src: path.join(
        process.cwd(),
        "node_modules/@fontsource/manrope/files/manrope-latin-400-normal.woff",
      ),
      fontWeight: 400,
    },
    {
      src: path.join(
        process.cwd(),
        "node_modules/@fontsource/manrope/files/manrope-latin-700-normal.woff",
      ),
      fontWeight: 700,
    },
  ],
});
Font.registerHyphenationCallback((word) => [word]);

const colors = { ink: "#17282c", muted: "#64716f", green: "#154b39", line: "#e1e6e2" };
const styles = StyleSheet.create({
  page: {
    padding: "45pt 42.5pt 54pt",
    fontFamily: "Manrope",
    fontSize: 10.5,
    color: colors.ink,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  logo: { width: 105, height: 30.1875 },
  brandLabel: { fontSize: 8, color: colors.muted },
  title: {
    marginTop: 18,
    marginBottom: 6,
    fontSize: 22,
    fontWeight: 700,
    lineHeight: 1.2,
    letterSpacing: -0.6,
  },
  subtitle: { color: colors.muted },
  metadata: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 18,
    padding: 12,
    paddingBottom: 2,
    backgroundColor: "#f0f3f0",
    borderRadius: 6,
  },
  field: { width: "50%", paddingRight: 18, marginBottom: 10 },
  label: {
    fontSize: 8,
    fontWeight: 700,
    color: colors.muted,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  value: { marginTop: 3, fontSize: 10, fontWeight: 700 },
  status: { marginTop: 12, fontSize: 9, color: colors.muted },
  header: { marginBottom: 21 },
  notice: {
    marginBottom: 18,
    padding: 11,
    borderWidth: 1,
    borderColor: "#e5c68a",
    borderLeftWidth: 3,
    backgroundColor: "#fff9ed",
    color: "#70450d",
    borderRadius: 4,
  },
  sectionTitle: {
    marginBottom: 9,
    fontSize: 13,
    fontWeight: 700,
    lineHeight: 1.3,
    color: colors.green,
  },
  summary: { marginBottom: 21, fontSize: 10.5, lineHeight: 1.55 },
  sectionHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    marginBottom: 12,
  },
  count: { fontSize: 9, color: colors.muted },
  action: {
    padding: "12pt 14pt",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 6,
  },
  actionMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
    fontSize: 8,
    color: colors.muted,
  },
  number: { fontWeight: 700 },
  priority: { flexDirection: "row", alignItems: "center", gap: 6 },
  badge: { padding: "1pt 5pt", borderWidth: 0.5, borderRadius: 3, fontSize: 8 },
  actionTitle: { fontSize: 12, fontWeight: 700, lineHeight: 1.4 },
  detail: { marginTop: 6, fontSize: 10.5, lineHeight: 1.55 },
  footer: {
    marginTop: 21,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    fontSize: 9,
    color: colors.muted,
  },
  reference: { marginTop: 6, fontSize: 7.5 },
  pageFooter: {
    position: "absolute",
    bottom: 24,
    left: 42.5,
    right: 42.5,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: colors.muted,
  },
});
const priorityColors = {
  high: { color: "#c2393e", backgroundColor: "#f9ebec", borderColor: "#e9b9bb" },
  medium: { color: "#94630e", backgroundColor: "#f4efe6", borderColor: "#dfcfb2" },
  low: { color: "#28764f", backgroundColor: "#eaf1ed", borderColor: "#bad3c5" },
};

type ClientReportData = Awaited<ReturnType<typeof getClientReport>>;
interface ClientReportPDFInput {
  report: ClientReportData["report"];
  application: ClientReportData["application"];
  isStale: boolean;
}

export async function renderClientReportPDF({
  report,
  application,
  isStale,
}: ClientReportPDFInput) {
  const logo = await readFile(
    path.join(process.cwd(), "public/logo/dark/transparent_logo_text_horizontal_nobuffer.png"),
  );
  const fields = [
    ["Prepared for", application.clientName ?? "Client"],
    ["Case reference", getDisplayCaseNumber(application.caseNumber, application.id)],
    ["Destination / Visa", `${application.destinationCountry} / ${application.visaType}`],
    [
      "Prepared",
      new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(
        report.createdAt,
      ),
    ],
  ];
  return renderToBuffer(
    <Document title="Client document report" author="Vidicy" language="en">
      <Page size="A4" style={styles.page}>
        <View style={styles.header} wrap={false}>
          <View style={styles.brand}>
            {/* This is the same local logo used by the app. */}
            <Image src={logo} style={styles.logo} />
            <Text style={styles.brandLabel}>
              {report.kind === "collection" ? "Document request" : "Document review"}
            </Text>
          </View>
          <Text style={styles.title}>Client document report</Text>
          <Text style={styles.subtitle}>
            {report.kind === "collection"
              ? "Documents and details to provide."
              : "Your document review and next steps."}
          </Text>
          <View style={styles.metadata}>
            {fields.map(([label, value]) => (
              <View key={label} style={styles.field}>
                <Text style={styles.label}>{label}</Text>
                <Text style={styles.value}>{value}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.status}>
            {isStale
              ? "Out of date - historical copy"
              : (CLIENT_REPORT_DELIVERY_STATUS_META[
                  report.status as keyof typeof CLIENT_REPORT_DELIVERY_STATUS_META
                ]?.label ?? report.status)}
          </Text>
        </View>
        {isStale ? (
          <Text style={styles.notice}>
            This report is out of date. It is a historical copy. Prepare a new report before sending
            current corrections.
          </Text>
        ) : null}
        <Text style={styles.sectionTitle} minPresenceAhead={30}>
          {report.kind === "collection" ? "Request summary" : "Review summary"}
        </Text>
        <Text style={styles.summary} orphans={3} widows={3}>
          {report.summary}
        </Text>
        <View style={styles.sectionHeading} minPresenceAhead={80}>
          <Text style={styles.sectionTitle}>What you need to do</Text>
          <Text style={styles.count}>
            {report.actionItems.length} action {report.actionItems.length === 1 ? "item" : "items"}
          </Text>
        </View>
        {report.actionItems.map((item, index) => (
          <View
            key={index}
            style={styles.action}
            wrap={item.detail.length > 1000 || item.title.length > 240}
          >
            <View style={styles.actionMeta} minPresenceAhead={40}>
              <Text style={styles.number}>ACTION {String(index + 1).padStart(2, "0")}</Text>
              <View style={styles.priority}>
                <Text>Priority</Text>
                <Text style={[styles.badge, priorityColors[item.severity]]}>
                  {item.severity[0].toUpperCase() + item.severity.slice(1)}
                </Text>
              </View>
            </View>
            <Text style={styles.actionTitle} minPresenceAhead={28}>
              {item.title}
            </Text>
            <Text style={styles.detail} orphans={3} widows={3}>
              {item.detail}
            </Text>
          </View>
        ))}
        <View style={styles.footer} wrap={false}>
          <Text>{CLIENT_REPORT_REVIEW_NOTE}</Text>
          <Text style={styles.reference}>Report reference: {report.id}</Text>
        </View>
        <View style={styles.pageFooter} fixed>
          <Text>Client document report</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>,
  );
}

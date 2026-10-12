import { redirect } from "next/navigation";

export default function LegacyAgencySettingsPage() {
  redirect("/dashboard/agency");
}

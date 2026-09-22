import { requireVerifiedPageSession } from "@/utils/auth-page";
import { NewApplicationClient } from "./new-application-client";

export default async function Page() {
  await requireVerifiedPageSession();

  return <NewApplicationClient />;
}

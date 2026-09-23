import "server-only";
import { getDB } from "@/db";
import { userTable } from "@/db/schema";
import { withKVCache, CACHE_KEYS } from "@/utils/with-kv-cache";

export async function getTotalUsers() {
  return withKVCache(
    async () => {
      const db = getDB();

      return await db.$count(userTable);
    },
    {
      key: CACHE_KEYS.TOTAL_USERS,
      ttl: "1 hour",
    }
  );
}

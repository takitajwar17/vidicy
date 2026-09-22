// Schema is split into domain files under ./schema/.
// This barrel re-export maintains backward compatibility for all existing `from "@/db/schema"` imports.
export * from "./schema/index";

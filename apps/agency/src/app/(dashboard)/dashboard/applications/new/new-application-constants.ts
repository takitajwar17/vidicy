import { EMBASSY_DATA } from "./new-application-embassy-map";
export { YEAR_OPTIONS } from "@/constants";
export {
  DESTINATION_COUNTRIES,
  VISA_TYPES_BY_DESTINATION,
  DEFAULT_VISA_TYPES,
  getVisaTypes,
} from "@/lib/visa-route-catalog";

// ---------------------------------------------------------------------------
// Helper: get embassy list for a destination + applyingFrom route.
// Returns null when no data → triggers freetext fallback.
// ---------------------------------------------------------------------------

export function getEmbassies(destination: string, applyingFrom: string): string[] | null {
  return EMBASSY_DATA[destination]?.[applyingFrom] ?? null;
}

import { describe, expect, it } from "vitest";

import {
  DEFAULT_VISA_TYPES,
  DESTINATION_COUNTRIES,
  VISA_TYPES_BY_DESTINATION,
} from "@/app/(dashboard)/dashboard/applications/new/new-application-constants";

describe("supported destinations consistency", () => {
  it("provides unique labeled visa options for every destination and the fallback", () => {
    expect(DESTINATION_COUNTRIES.length).toBeGreaterThan(0);
    expect(new Set(DESTINATION_COUNTRIES).size).toBe(DESTINATION_COUNTRIES.length);
    expect(Object.keys(VISA_TYPES_BY_DESTINATION)).toEqual(DESTINATION_COUNTRIES);

    for (const options of [...Object.values(VISA_TYPES_BY_DESTINATION), DEFAULT_VISA_TYPES]) {
      expect(options.length).toBeGreaterThan(0);
      expect(new Set(options.map((option) => option.value)).size).toBe(options.length);
      for (const option of options) {
        expect(option.value.trim()).not.toBe("");
        expect(option.label.trim()).not.toBe("");
      }
    }
  });
});

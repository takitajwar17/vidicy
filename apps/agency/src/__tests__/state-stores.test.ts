import { describe, it, expect } from "vitest";
import { useSessionStore } from "@/state/session";
import { useConfigStore } from "@/state/config";
import type { KVSession } from "@/infra/kv-session";

describe("State Store Data Consistency", () => {
  // ============================
  // Session Store
  // ============================
  describe("Session Store", () => {
    it("should initialize with null session", () => {
      const state = useSessionStore.getState();
      expect(state.session).toBeNull();
    });

    it("should initialize with loading state", () => {
      const state = useSessionStore.getState();
      expect(state.isLoading).toBe(true);
    });

    it("should set session correctly", () => {
      const mockSession: KVSession = {
        id: "session-123",
        userId: "usr_abc",
        expiresAt: Date.now() + 86400000,
        createdAt: Date.now(),
        user: {
          id: "usr_abc",
          email: "test@example.com",
          firstName: "John",
          lastName: "Doe",
          role: "user",
          emailVerified: new Date(),
          avatar: null,
          googleAccountId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      useSessionStore.getState().setSession(mockSession);
      const state = useSessionStore.getState();
      expect(state.session).toEqual(mockSession);
      expect(state.isLoading).toBe(false);
    });

    it("should clear session correctly", () => {
      useSessionStore.getState().clearSession();
      const state = useSessionStore.getState();
      expect(state.session).toBeNull();
      expect(state.isLoading).toBe(false);
    });
  });

  // ============================
  // Config Store
  // ============================
  describe("Config Store", () => {
    it("should initialize with SSO and Turnstile disabled", () => {
      const state = useConfigStore.getState();
      expect(state.isGoogleSSOEnabled).toBe(false);
      expect(state.isTurnstileEnabled).toBe(false);
    });

    it("should update config correctly", () => {
      useConfigStore.getState().setConfig({
        isGoogleSSOEnabled: true,
        isTurnstileEnabled: true,
      });
      const state = useConfigStore.getState();
      expect(state.isGoogleSSOEnabled).toBe(true);
      expect(state.isTurnstileEnabled).toBe(true);
    });

    it("should allow toggling individual flags", () => {
      useConfigStore.getState().setConfig({
        isGoogleSSOEnabled: false,
        isTurnstileEnabled: true,
      });
      const state = useConfigStore.getState();
      expect(state.isGoogleSSOEnabled).toBe(false);
      expect(state.isTurnstileEnabled).toBe(true);
    });
  });
});

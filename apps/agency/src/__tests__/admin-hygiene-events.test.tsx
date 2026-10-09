import { beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";

const state = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }));
const actions = vi.hoisted(() => ({
  users: vi.fn(),
  preview: vi.fn(),
  remove: vi.fn(),
  role: vi.fn(),
  verify: vi.fn(),
  inquiry: vi.fn(),
  export: vi.fn(),
  error: vi.fn(),
}));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useEffect: () => undefined,
  useRef: <T,>(initial: T) => {
    const slot = state.cursor++;
    if (!(slot in state.values)) state.values[slot] = { current: initial };
    return state.values[slot];
  },
  useState: <T,>(initial: T | (() => T)) => {
    const slot = state.cursor++;
    const values = state.values;
    if (!(slot in values))
      values[slot] = typeof initial === "function" ? (initial as () => T)() : initial;
    return [
      values[slot],
      (next: T | ((value: T) => T)) => {
        values[slot] =
          typeof next === "function" ? (next as (value: unknown) => T)(values[slot]) : next;
      },
    ];
  },
}));
vi.mock("next/dynamic", () => ({
  default: () =>
    function Table() {
      return null;
    },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next/image", () => ({
  default: function Image() {
    return null;
  },
}));
vi.mock("nuqs", () => ({
  useQueryState: (_name: string, options: { defaultValue: string }) => [
    options.defaultValue,
    vi.fn(),
  ],
}));
vi.mock("sonner", () => ({ toast: { error: actions.error, success: vi.fn(), warning: vi.fn() } }));
vi.mock("@/components/csrf-provider", () => ({ useCsrfToken: () => "csrf" }));
vi.mock("@/components/admin/columns", () => ({ columns: [] }));
vi.mock("@/lib/csv-export", () => ({ exportToCSV: actions.export }));
vi.mock("@/app/(admin)/admin/_actions/get-users.action", () => ({ getUsersAction: actions.users }));
vi.mock("@/app/(admin)/admin/_actions/bulk-actions", () => ({
  previewDeleteUsersAction: actions.preview,
  bulkDeleteUsersAction: actions.remove,
  bulkUpdateUserRoleAction: actions.role,
  bulkVerifyUserEmailAction: actions.verify,
}));
vi.mock("@/actions/enterprise.action", () => ({
  updateEnterpriseInquiryStatusAction: actions.inquiry,
}));
vi.mock("@/actions/support.action", () => ({
  updateTicketStatusAction: vi.fn(),
  deleteTicketAction: vi.fn(),
  addSupportMessageAction: vi.fn(),
  markTicketAsViewedByAdminAction: vi.fn(),
}));
vi.mock("zsa-react", () => ({
  useServerAction: (
    action: (input: unknown) => Promise<[unknown, { message: string } | null]>,
    options?: {
      onSuccess?: (result: { data: unknown }) => void;
      onError?: (result: { err: { message: string } }) => void;
    },
  ) => ({
    execute: async (input: unknown) => {
      const result = (await action(input)) ?? [null, null];
      if (result[1]) options?.onError?.({ err: result[1] });
      else options?.onSuccess?.({ data: result[0] });
      return result;
    },
    isPending: false,
  }),
}));

import { UsersTable } from "@/components/admin/users-table";
import { EnterpriseInquiriesClient } from "@/components/admin/enterprise-inquiries-client";
import { TicketDetail } from "@/components/admin/ticket-detail";

function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as ReactNode)];
}
function find(
  node: ReactNode,
  predicate: (element: ReactElement<Record<string, unknown>>) => boolean,
) {
  const match = elements(node).find(predicate);
  if (!match) throw new Error("Expected control was not rendered");
  return match;
}
function text(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return isValidElement<{ children?: ReactNode }>(node) ? text(node.props.children) : "";
}
function button(node: ReactNode, label: string) {
  return find(
    node,
    (element) =>
      typeof element.props.onClick === "function" &&
      text(element.props.children as ReactNode).trim() === label,
  );
}
async function click(element: ReactElement<Record<string, unknown>>) {
  await (element.props.onClick as () => Promise<unknown> | void)();
}
function frame(render: () => ReactNode) {
  const values: unknown[] = [];
  return () => {
    state.values = values;
    state.cursor = 0;
    return render();
  };
}
function childFrame(element: ReactElement<Record<string, unknown>>) {
  return frame(() =>
    (element.type as (props: Record<string, unknown>) => ReactNode)(element.props),
  );
}
const usersProps = {
  initialData: {
    users: [{ id: "user_1", email: "user@example.com" }],
    totalPages: 1,
    totalCount: 1,
  },
  initialEmailFilter: "",
  initialPage: "1",
  initialPageSize: "10",
} as Parameters<typeof UsersTable>[0];
function bulkControls(node: ReactNode, selected = ["user_1"]) {
  const table = find(node, (element) => typeof element.props.bulkActions === "function");
  return (table.props.bulkActions as (ids: string[], clear: () => void) => ReactNode)(
    selected,
    vi.fn(),
  );
}

describe("admin controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actions.preview.mockResolvedValue([null, { message: "Preview unavailable" }]);
    actions.remove.mockResolvedValue([
      { success: true, deleted: 1, appsTransferred: 1, appsDeleted: 2, errors: [] },
      null,
    ]);
  });

  it("exports selected rows from the initial displayed data", async () => {
    const render = frame(() => UsersTable(usersProps));
    await click(button(bulkControls(render()), "Export"));
    expect(actions.export).toHaveBeenCalledWith(
      usersProps.initialData.users,
      expect.stringMatching(/^users-export-/),
    );
  });

  it.each(["action error", "thrown error"])(
    "blocks permanent deletion after a preview %s",
    async (mode) => {
      const render = frame(() => UsersTable(usersProps));
      if (mode === "thrown error")
        actions.preview.mockRejectedValueOnce(new Error("Network unavailable"));
      await click(button(bulkControls(render()), "Delete"));
      const dialog = render();
      expect(button(dialog, "Delete permanently").props.disabled).toBe(true);
      expect(text(find(dialog, (element) => element.props.role === "alert"))).toContain(
        "Could not load the deletion impact",
      );
      expect(text(dialog)).not.toContain("No applications are owned");
      await click(button(dialog, "Delete permanently"));
      expect(actions.remove).not.toHaveBeenCalled();
    },
  );

  it("clears a failed preview and blocks deletion while a retry is pending", async () => {
    const render = frame(() => UsersTable(usersProps));
    await click(button(bulkControls(render()), "Delete"));
    await click(button(render(), "Cancel"));
    let finish!: (result: unknown) => void;
    actions.preview.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const retry = click(button(bulkControls(render()), "Delete"));
    expect(button(render(), "Delete permanently").props.disabled).toBe(true);
    expect(elements(render()).some((element) => element.props.role === "alert")).toBe(false);
    finish([{ usersToDelete: 1, appsToTransfer: 1, appsToDelete: 2 }, null]);
    await retry;
    expect(button(render(), "Delete permanently").props.disabled).toBe(false);
    expect(text(render())).toContain("2 applications");
    await click(button(render(), "Delete permanently"));
    expect(actions.remove).toHaveBeenCalledWith({ userIds: ["user_1"], csrfToken: "csrf" });
  });

  it("ignores a canceled preview that finishes after a new selection", async () => {
    const render = frame(() => UsersTable(usersProps));
    let finish!: (result: unknown) => void;
    actions.preview.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const oldRequest = click(button(bulkControls(render()), "Delete"));
    await click(button(render(), "Cancel"));
    actions.preview.mockResolvedValueOnce([
      { usersToDelete: 1, appsToTransfer: 0, appsToDelete: 2 },
      null,
    ]);
    await click(button(bulkControls(render(), ["user_2"]), "Delete"));
    finish([null, { message: "Old preview failed" }]);
    await oldRequest;
    expect(button(render(), "Delete permanently").props.disabled).toBe(false);
    expect(text(render())).toContain("2 applications");
    expect(elements(render()).some((element) => element.props.role === "alert")).toBe(false);
    await click(button(render(), "Delete permanently"));
    expect(actions.remove).toHaveBeenCalledWith({ userIds: ["user_2"], csrfToken: "csrf" });
  });

  it("updates the inquiry list from the successful action data", async () => {
    const inquiry = {
      id: "inquiry_1",
      name: "Client",
      company: "Agency",
      email: "client@example.com",
      status: "new",
      createdAt: new Date(),
      adminNote: null,
    } as Parameters<typeof EnterpriseInquiriesClient>[0]["inquiries"][number];
    const parent = frame(() => EnterpriseInquiriesClient({ inquiries: [inquiry] }));
    const detail = childFrame(
      find(
        parent(),
        (element) => typeof element.type === "function" && element.type.name === "InquiryDetail",
      ),
    );
    actions.inquiry.mockResolvedValueOnce([
      { ...inquiry, status: "closed", adminNote: "Contact completed" },
      null,
    ]);
    await click(button(detail(), "Save changes"));
    const updated = find(
      parent(),
      (element) => typeof element.type === "function" && element.type.name === "InquiryDetail",
    );
    expect(updated.props.inquiry).toMatchObject({
      status: "closed",
      adminNote: "Contact completed",
    });
  });

  it("uses direct browser requests for every authenticated screenshot", () => {
    const ticket = {
      id: "ticket_1",
      status: "open",
      category: "bug",
      priority: "medium",
      subject: "Upload",
      description: "Details",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastUpdatedAt: new Date(),
      screenshotUrls: ["ticket.png"],
      messages: [true, false].map((isAdminReply, index) => ({
        id: `message_${index}`,
        content: "Reply",
        isAdminReply,
        isSystemMessage: false,
        createdAt: new Date(),
        screenshotUrls: [`message_${index}.png`],
      })),
    } as Parameters<typeof TicketDetail>[0]["ticket"];
    const render = frame(() => TicketDetail({ ticket }));
    const screenshots = elements(render()).filter(
      (element) =>
        typeof element.props.src === "string" &&
        element.props.src.startsWith("/api/support-screenshot?"),
    );
    expect(screenshots).toHaveLength(3);
    expect(screenshots.every((element) => element.props.unoptimized === true)).toBe(true);
  });
});

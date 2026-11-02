import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import NewInvoiceTab from "@/components/invoicing/NewInvoiceTab";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const query: any = { then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve) };
      for (const method of ["select", "eq", "order", "limit"]) query[method] = () => query;
      return query;
    },
    rpc: () => ({ range: () => Promise.resolve({ data: [], error: null }) }),
    auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
  },
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/invoicing/InvoicePreviewDialog", () => ({ default: () => null }));

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("optional invoice remark", () => {
  it("preserves quickly typed notes instead of treating them as barcode scans", async () => {
    render(<NewInvoiceTab storeId="test-store" userId="test-user" />);
    await act(async () => {});
    vi.useFakeTimers();
    let now = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const input = screen.getByLabelText("Remark") as HTMLInputElement;
    const remark = "Please gift wrap SKU-12345678";
    for (const key of remark) {
      now += 20;
      const accepted = fireEvent.keyDown(input, { key });
      if (accepted) fireEvent.change(input, { target: { value: input.value + key } });
    }
    act(() => { vi.advanceTimersByTime(700); });
    expect(input.value).toBe(remark);
    expect(JSON.parse(localStorage.getItem("invoice_draft") ?? "{}").invoiceRemark).toBe(remark);
    cleanup();
    render(<NewInvoiceTab storeId="test-store" userId="test-user" />);
    expect((screen.getByLabelText("Remark") as HTMLInputElement).value).toBe(remark);
    await act(async () => {});
  });
});
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "./toast";
import { BugReportWidget } from "./bugReportWidget";

function renderWidget() {
  return render(
    <ToastProvider>
      <BugReportWidget />
    </ToastProvider>
  );
}

describe("BugReportWidget", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the floating trigger button", () => {
    renderWidget();

    const button = screen.getByRole("button", { name: "Report a bug" });
    expect(button).toBeInTheDocument();
  });

  it("does not show the form panel initially", () => {
    renderWidget();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the form panel when the trigger is clicked", async () => {
    renderWidget();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Report a bug" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Report a Bug")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toBeInTheDocument();
    expect(screen.getByLabelText("Description")).toBeInTheDocument();
    expect(screen.getByLabelText("Priority")).toBeInTheDocument();
  });

  it("closes the panel when Cancel is clicked", async () => {
    renderWidget();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Report a bug" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes the panel when the FAB is clicked while open", async () => {
    renderWidget();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Report a bug" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close bug report" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("submits the form and shows a success toast", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, issueId: "CHAOS-42", issueUrl: "https://linear.app/issue/CHAOS-42" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    renderWidget();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Report a bug" }));
    await user.type(screen.getByLabelText("Title"), "Something broke");
    await user.type(screen.getByLabelText("Description"), "It broke badly");
    await user.click(screen.getByRole("button", { name: "Submit Bug Report" }));

    await waitFor(() => {
      expect(screen.getByText("Bug reported as CHAOS-42")).toBeInTheDocument();
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/v1/bug-report",
      expect.objectContaining({
        method: "POST"
      })
    );

    // Panel should close after successful submission
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows an error toast when submission fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "linear_api_error", detail: "API key invalid" }), {
        status: 502,
        headers: { "content-type": "application/json" }
      })
    );

    renderWidget();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Report a bug" }));
    await user.type(screen.getByLabelText("Title"), "Test bug");
    await user.type(screen.getByLabelText("Description"), "Description text");
    await user.click(screen.getByRole("button", { name: "Submit Bug Report" }));

    await waitFor(() => {
      expect(screen.getByText("API key invalid")).toBeInTheDocument();
    });

    // Panel should remain open on error
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows an error toast on network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Failed to fetch"));

    renderWidget();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Report a bug" }));
    await user.type(screen.getByLabelText("Title"), "Test bug");
    await user.type(screen.getByLabelText("Description"), "Description text");
    await user.click(screen.getByRole("button", { name: "Submit Bug Report" }));

    await waitFor(() => {
      expect(screen.getByText("Failed to fetch")).toBeInTheDocument();
    });
  });

  it("disables submit button while submitting", async () => {
    let resolveResponse: (value: Response) => void;
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        })
    );

    renderWidget();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Report a bug" }));
    await user.type(screen.getByLabelText("Title"), "Test bug");
    await user.type(screen.getByLabelText("Description"), "Description");

    fireEvent.submit(screen.getByRole("button", { name: "Submit Bug Report" }).closest("form")!);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Submitting..." })).toBeDisabled();
    });

    resolveResponse!(
      new Response(JSON.stringify({ success: true, issueId: "CHAOS-1" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
  });

  it("defaults priority to Normal", async () => {
    renderWidget();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Report a bug" }));

    const select = screen.getByLabelText("Priority") as HTMLSelectElement;
    expect(select.value).toBe("3");
  });
});

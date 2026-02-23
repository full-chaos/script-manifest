import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Modal } from "./modal";

describe("Modal", () => {
  beforeEach(() => {
    cleanup();
  });

  it("renders nothing when closed", () => {
    const onClose = vi.fn();
    render(
      <Modal open={false} title="Test Modal" onClose={onClose}>
        <p>Modal content</p>
      </Modal>
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Modal content")).not.toBeInTheDocument();
  });

  it("renders title, description, and children when open", () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} title="My Modal" description="A helpful description" onClose={onClose}>
        <p>Modal body</p>
      </Modal>
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("My Modal")).toBeInTheDocument();
    expect(screen.getByText("A helpful description")).toBeInTheDocument();
    expect(screen.getByText("Modal body")).toBeInTheDocument();
  });

  it("calls onClose when Close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} title="Close Test" onClose={onClose}>
        <span>content</span>
      </Modal>
    );

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape key is pressed", () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} title="Escape Test" onClose={onClose}>
        <span>content</span>
      </Modal>
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not render description element when description prop is omitted", () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} title="No Desc" onClose={onClose}>
        <span>content</span>
      </Modal>
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).not.toHaveAttribute("aria-describedby");
  });
});

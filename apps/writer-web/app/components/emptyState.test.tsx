import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmptyState } from "./emptyState";

describe("EmptyState", () => {
  beforeEach(() => {
    cleanup();
  });

  it("renders title and description", () => {
    render(<EmptyState title="Nothing here" description="Come back later." />);

    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(screen.getByText("Come back later.")).toBeInTheDocument();
  });

  it("renders an icon when icon prop is provided", () => {
    render(<EmptyState title="Empty" icon="🔍" />);

    const icon = screen.getByRole("img", { hidden: true });
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveTextContent("🔍");
  });

  it("renders a custom illustration when illustration prop is provided", () => {
    const illustration = <svg data-testid="custom-illustration" />;
    render(<EmptyState title="Custom" illustration={illustration} />);

    expect(screen.getByTestId("custom-illustration")).toBeInTheDocument();
  });

  it("renders an action link when actionLabel and actionHref are provided", () => {
    render(
      <EmptyState
        title="No scripts"
        actionLabel="Add a script"
        actionHref="/projects"
      />
    );

    const link = screen.getByRole("link", { name: "Add a script" });
    expect(link).toHaveAttribute("href", "/projects");
  });

  it("renders an action button and calls onAction when clicked", () => {
    const onAction = vi.fn();
    render(
      <EmptyState
        title="Empty state"
        actionLabel="Do something"
        onAction={onAction}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Do something" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("does not render an action when only actionLabel is provided without href or handler", () => {
    render(<EmptyState title="No action" actionLabel="Orphan label" />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

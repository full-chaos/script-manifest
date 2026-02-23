import { cleanup, render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { SkeletonCard, SkeletonRow, SkeletonText } from "./skeleton";

describe("SkeletonCard", () => {
  beforeEach(() => {
    cleanup();
  });

  it("renders with aria-hidden to hide from assistive technology", () => {
    const { container } = render(<SkeletonCard />);
    const root = container.firstChild as HTMLElement;
    expect(root).toHaveAttribute("aria-hidden", "true");
  });

  it("renders with animate-pulse class for loading animation", () => {
    const { container } = render(<SkeletonCard />);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("animate-pulse");
  });

  it("merges additional className prop", () => {
    const { container } = render(<SkeletonCard className="extra-class" />);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("extra-class");
  });
});

describe("SkeletonRow", () => {
  beforeEach(() => {
    cleanup();
  });

  it("renders with aria-hidden and animate-pulse", () => {
    const { container } = render(<SkeletonRow />);
    const root = container.firstChild as HTMLElement;
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(root.className).toContain("animate-pulse");
  });

  it("merges additional className prop", () => {
    const { container } = render(<SkeletonRow className="my-row" />);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("my-row");
  });
});

describe("SkeletonText", () => {
  beforeEach(() => {
    cleanup();
  });

  it("renders with aria-hidden and animate-pulse", () => {
    const { container } = render(<SkeletonText />);
    const root = container.firstChild as HTMLElement;
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(root.className).toContain("animate-pulse");
  });

  it("renders multiple placeholder lines", () => {
    const { container } = render(<SkeletonText />);
    const lines = container.querySelectorAll("div > div");
    expect(lines.length).toBeGreaterThanOrEqual(3);
  });
});

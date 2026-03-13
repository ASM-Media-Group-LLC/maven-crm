import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import BackgroundSelector, { BACKGROUND_TEMPLATES, BackgroundEffect } from "@/pages/messenger/videocall/BackgroundSelector";

describe("BackgroundSelector", () => {
  const defaultProps = {
    selected: "none" as BackgroundEffect,
    onSelect: vi.fn(),
  };

  it("renders trigger button", () => {
    render(<BackgroundSelector {...defaultProps} />);
    expect(screen.getByTitle("Fondo virtual")).toBeInTheDocument();
  });

  it("applies active styling when background is selected", () => {
    render(<BackgroundSelector {...defaultProps} selected="blur" />);
    const btn = screen.getByTitle("Fondo virtual");
    expect(btn.className).toContain("214");
  });

  it("BACKGROUND_TEMPLATES has correct structure", () => {
    expect(BACKGROUND_TEMPLATES.length).toBeGreaterThanOrEqual(8);
    BACKGROUND_TEMPLATES.forEach((tpl) => {
      expect(tpl).toHaveProperty("id");
      expect(tpl).toHaveProperty("label");
      expect(tpl).toHaveProperty("src");
      expect(tpl.id).toMatch(/^tpl-/);
      expect(tpl.src).toMatch(/^\/backgrounds\//);
    });
  });

  it("all template IDs are unique", () => {
    const ids = BACKGROUND_TEMPLATES.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

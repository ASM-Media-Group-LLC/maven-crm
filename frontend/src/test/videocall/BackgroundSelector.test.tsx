import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import BackgroundSelector, { BACKGROUND_TEMPLATES, BackgroundEffect, isCustomBackground, getCustomBackgroundUrl, isTemplateBackground } from "@/pages/messenger/videocall/BackgroundSelector";

vi.mock("@/hooks/useLanguage", (original) =>
  import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));

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
    expect(btn.className).toContain("primary");
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

describe("isCustomBackground", () => {
  it("returns true for custom: prefixed strings", () => {
    expect(isCustomBackground("custom:blob:http://localhost/abc")).toBe(true);
    expect(isCustomBackground("custom:https://example.com/img.jpg")).toBe(true);
  });

  it("returns false for non-custom values", () => {
    expect(isCustomBackground("none")).toBe(false);
    expect(isCustomBackground("blur")).toBe(false);
    expect(isCustomBackground("tpl-office")).toBe(false);
  });
});

describe("getCustomBackgroundUrl", () => {
  it("strips the custom: prefix", () => {
    expect(getCustomBackgroundUrl("custom:blob:http://localhost/abc")).toBe("blob:http://localhost/abc");
  });
});

describe("isTemplateBackground", () => {
  it("returns true for template IDs", () => {
    expect(isTemplateBackground("tpl-office")).toBe(true);
  });

  it("returns false for none, blur, and custom backgrounds", () => {
    expect(isTemplateBackground("none")).toBe(false);
    expect(isTemplateBackground("blur")).toBe(false);
    expect(isTemplateBackground("custom:blob:http://localhost/abc")).toBe(false);
  });
});

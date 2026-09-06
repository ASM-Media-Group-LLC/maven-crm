import { describe, it, expect } from "vitest";
import { viewportSinZoomAlEnfocar } from "@/lib/sinZoomAlEnfocar";

describe("viewportSinZoomAlEnfocar", () => {
  it("agrega maximum-scale=1 una sola vez", () => {
    const base = "width=device-width, initial-scale=1.0, viewport-fit=cover";
    const con = viewportSinZoomAlEnfocar(base);
    expect(con).toBe(`${base}, maximum-scale=1`);
    expect(viewportSinZoomAlEnfocar(con)).toBe(con);
  });
});

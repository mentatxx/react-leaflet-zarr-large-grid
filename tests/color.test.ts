import { describe, expect, it } from "vitest";
import { parseHexColor } from "../src/color.js";

describe("parseHexColor", () => {
  it("reads #rrggbb", () => {
    expect(parseHexColor("#ff00aa")).toEqual({ r: 255, g: 0, b: 170 });
    expect(parseHexColor("#FF00AA")).toEqual({ r: 255, g: 0, b: 170 });
  });

  it("rejects other formats", () => {
    expect(parseHexColor("#fff")).toBeNull();
    expect(parseHexColor("ff00aa")).toBeNull();
    expect(parseHexColor("#ff00aagg")).toBeNull();
  });
});

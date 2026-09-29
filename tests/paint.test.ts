import { describe, expect, it } from "vitest";
import type { GridFrame } from "../src/geo.js";
import { paintTile } from "../src/paint.js";
import { METERS_PER_DEGREE_LAT } from "../src/geo.js";

const frame: GridFrame = {
  west: 0,
  north: 2,
  rows: 2,
  cols: 2,
  cellWidthDeg: 1,
  cellHeightDeg: 1,
  metersPerDegLng: METERS_PER_DEGREE_LAT,
};

const tile = { west: 0, south: 0, east: 2, north: 2 };
const values = new Float64Array([1, 2, 3, Number.NaN]);

function color(value: number): string {
  if (value === 1) return "#ff0000";
  if (value === 2) return "#00ff00";
  if (value === 3) return "#0000ff";
  if (value === 2.5) return "#111111";
  return "#ffffff";
}

function pixel(data: Uint8ClampedArray, width: number, x: number, y: number): number[] {
  const offset = (y * width + x) * 4;
  return [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]];
}

describe("paintTile", () => {
  it("paints the cell under each pixel center when sampling nearest", () => {
    const data = paintTile({
      width: 2,
      height: 2,
      tile,
      frame,
      window: { rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 2 },
      values,
      palette: color,
      sampling: "nearest",
    });
    expect(pixel(data, 2, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(pixel(data, 2, 1, 0)).toEqual([0, 255, 0, 255]);
    expect(pixel(data, 2, 0, 1)).toEqual([0, 0, 255, 255]);
    expect(pixel(data, 2, 1, 1)).toEqual([0, 0, 0, 0]);
  });

  it("averages finite cells covered by a pixel", () => {
    const data = paintTile({
      width: 1,
      height: 1,
      tile,
      frame,
      window: { rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 2 },
      values: new Float64Array([1, 2, 3, 4]),
      palette: color,
      sampling: "average",
    });
    expect(pixel(data, 1, 0, 0)).toEqual([17, 17, 17, 255]);
  });
});

import { describe, expect, it } from "vitest";
import { createGridFrame, gridFootprint, toMercator, type UniformGridFrame } from "../src/geo.js";
import { paintTile } from "../src/paint.js";

function quadrantFrame(): UniformGridFrame {
  const north = toMercator(0, 2).y;
  const south = toMercator(0, 0).y;
  return {
    kind: "uniform",
    rowOrigin: "north",
    originX: 0,
    originY: north,
    rows: 2,
    cols: 2,
    cellWidth: toMercator(1, 0).x,
    cellHeight: (north - south) / 2,
    groundScale: 1,
  };
}

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
    const frame = quadrantFrame();
    const data = paintTile({
      width: 2,
      height: 2,
      tile: gridFootprint(frame),
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

  it("samples the Web Mercator position of the pixel, not linear latitude", () => {
    const cell = 200_000;
    const frame = createGridFrame({
      bounds: { west: 0, south: 0, east: 1, north: 60 },
      cellSize: { width: cell, height: cell },
      rows: 20,
      cols: 1,
    });
    const samples = new Float64Array(20);
    for (let row = 0; row < samples.length; row += 1) samples[row] = row;
    const data = paintTile({
      width: 1,
      height: 1000,
      tile: { west: 0, south: 0, east: 0.01, north: 60 },
      frame,
      window: { rowStart: 0, rowEnd: 20, colStart: 0, colEnd: 1 },
      values: samples,
      palette: (value) => (value === 12 ? "#00ff00" : "#ff0000"),
      sampling: "nearest",
    });
    expect(pixel(data, 1, 0, 330)).toEqual([0, 255, 0, 255]);
  });

  it("paints geographic cells with row 0 at the north", () => {
    const frame = createGridFrame({
      bounds: { west: 10, south: 20, east: 12, north: 22 },
      cellSize: { width: 1, height: 1 },
      rows: 2,
      cols: 2,
      placement: "geographic",
    });
    const data = paintTile({
      width: 2,
      height: 2,
      tile: { west: 10, south: 20, east: 12, north: 22 },
      frame,
      window: { rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 2 },
      values: new Float64Array([1, 2, 3, 4]),
      palette: color,
      sampling: "nearest",
    });
    expect(pixel(data, 2, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(pixel(data, 2, 1, 0)).toEqual([0, 255, 0, 255]);
    expect(pixel(data, 2, 0, 1)).toEqual([0, 0, 255, 255]);
    expect(pixel(data, 2, 1, 1)).toEqual([255, 255, 255, 255]);
  });

  it("averages the northern geographic cell when rowOrigin is north", () => {
    const frame = createGridFrame({
      bounds: { west: 10, south: 20, east: 12, north: 22 },
      cellSize: { width: 1, height: 1 },
      rows: 2,
      cols: 2,
      placement: "geographic",
    });
    const data = paintTile({
      width: 1,
      height: 1,
      tile: { west: 10, south: 21, east: 11, north: 22 },
      frame,
      window: { rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 2 },
      values: new Float64Array([1, 2, 3, 4]),
      palette: color,
      sampling: "average",
    });
    expect(pixel(data, 1, 0, 0)).toEqual([255, 0, 0, 255]);
  });

  it("averages the northern geographic cell as row 1 when rowOrigin is south", () => {
    const frame = createGridFrame({
      bounds: { west: 10, south: 20, east: 12, north: 22 },
      cellSize: { width: 1, height: 1 },
      rows: 2,
      cols: 2,
      placement: "geographic",
      rowOrigin: "south",
    });
    const data = paintTile({
      width: 1,
      height: 1,
      tile: { west: 10, south: 21, east: 11, north: 22 },
      frame,
      window: { rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 2 },
      values: new Float64Array([1, 2, 3, 4]),
      palette: color,
      sampling: "average",
    });
    expect(pixel(data, 1, 0, 0)).toEqual([0, 0, 255, 255]);
  });

  it("averages finite cells covered by a pixel", () => {
    const frame = quadrantFrame();
    const data = paintTile({
      width: 1,
      height: 1,
      tile: gridFootprint(frame),
      frame,
      window: { rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 2 },
      values: new Float64Array([1, 2, 3, 4]),
      palette: color,
      sampling: "average",
    });
    expect(pixel(data, 1, 0, 0)).toEqual([17, 17, 17, 255]);
  });
});

import { describe, expect, it } from "vitest";
import {
  cellIndex,
  cellWindow,
  createGridFrame,
  footprintDriftMeters,
  gridFootprint,
  METERS_PER_DEGREE_LAT,
  type GridFrame,
} from "../src/geo.js";

const frame: GridFrame = {
  west: 0,
  north: 10,
  rows: 10,
  cols: 10,
  cellWidthDeg: 1,
  cellHeightDeg: 1,
  metersPerDegLng: METERS_PER_DEGREE_LAT,
};

describe("grid frame", () => {
  it("converts meters to degrees at the latitude of the bounds center", () => {
    const created = createGridFrame({
      bounds: { west: 0, south: 0, east: 1, north: 0 },
      cellSize: { width: METERS_PER_DEGREE_LAT, height: METERS_PER_DEGREE_LAT },
      rows: 2,
      cols: 3,
    });
    expect(created.cellWidthDeg).toBeCloseTo(1, 6);
    expect(created.cellHeightDeg).toBeCloseTo(1, 6);
    expect(created.west).toBe(0);
    expect(created.north).toBe(0);
  });

  it("places cell 0,0 at the north-west corner", () => {
    expect(cellIndex(frame, 0.1, 9.9)).toEqual({ row: 0, col: 0 });
    expect(cellIndex(frame, 1.1, 8.9)).toEqual({ row: 1, col: 1 });
    expect(cellIndex(frame, 5, 10)).toEqual({ row: 0, col: 5 });
    expect(cellIndex(frame, 10, 5)).toBeNull();
    expect(cellIndex(frame, 5, 10.1)).toBeNull();
  });

  it("clips the visible window to the grid", () => {
    expect(cellWindow(frame, { west: -1, south: 8.2, east: 1.2, north: 11 })).toEqual({
      rowStart: 0,
      rowEnd: 2,
      colStart: 0,
      colEnd: 2,
    });
    expect(cellWindow(frame, { west: 20, south: 0, east: 21, north: 1 })).toBeNull();
  });

  it("measures how far the declared south-east corner is from the meter grid", () => {
    const footprint = gridFootprint(frame);
    expect(footprint).toEqual({ west: 0, north: 10, east: 10, south: 0 });
    const drift = footprintDriftMeters({ west: 0, north: 10, east: 10, south: 1 }, frame);
    expect(drift.east).toBeCloseTo(0, 5);
    expect(drift.south).toBeCloseTo(-METERS_PER_DEGREE_LAT, 5);
  });
});

import { describe, expect, it } from "vitest";
import {
  cellIndex,
  cellWindow,
  createGridFrame,
  footprintDriftMeters,
  fromMercator,
  gridFootprint,
  toMercator,
  type UniformGridFrame,
} from "../src/geo.js";

function equatorFrame(): UniformGridFrame {
  const frame = createGridFrame({
    bounds: { west: 0, south: 0, east: 0, north: 0 },
    cellSize: { width: 1000, height: 1000 },
    rows: 10,
    cols: 10,
  });
  if (frame.kind !== "uniform") throw new Error("expected a uniform frame");
  return frame;
}

describe("grid frame", () => {
  it("scales a ground cell by 1/cos(latitude) in EPSG:3857", () => {
    const created = createGridFrame({
      bounds: { west: 0, south: 59, east: 1, north: 61 },
      cellSize: { width: 10, height: 10 },
      rows: 2,
      cols: 3,
    });
    if (created.kind !== "uniform") throw new Error("expected a uniform frame");
    expect(created.cellWidth).toBeCloseTo(20, 6);
    expect(created.cellHeight).toBeCloseTo(20, 6);
    const origin = toMercator(0, 61);
    expect(created.originX).toBeCloseTo(origin.x, 4);
    expect(created.originY).toBeCloseTo(origin.y, 4);
    expect(created.groundScale).toBeCloseTo(0.5, 6);
  });

  it("places cell 0,0 at the north-west corner", () => {
    const frame = equatorFrame();
    const inside = fromMercator(frame.originX + 100, frame.originY - 100);
    const next = fromMercator(frame.originX + 1500, frame.originY - 1500);
    const onNorthEdge = fromMercator(frame.originX + 5500, frame.originY);
    const eastOfGrid = fromMercator(frame.originX + 10_000, frame.originY - 100);
    const northOfGrid = fromMercator(frame.originX + 100, frame.originY + 10);

    expect(cellIndex(frame, inside.lng, inside.lat)).toEqual({ row: 0, col: 0 });
    expect(cellIndex(frame, next.lng, next.lat)).toEqual({ row: 1, col: 1 });
    expect(cellIndex(frame, onNorthEdge.lng, onNorthEdge.lat)).toEqual({ row: 0, col: 5 });
    expect(cellIndex(frame, eastOfGrid.lng, eastOfGrid.lat)).toBeNull();
    expect(cellIndex(frame, northOfGrid.lng, northOfGrid.lat)).toBeNull();
  });

  it("clips the visible window to the grid", () => {
    const frame = equatorFrame();
    const outside = fromMercator(frame.originX - 500, frame.originY + 500);
    const inside = fromMercator(frame.originX + 1500, frame.originY - 1500);
    expect(
      cellWindow(frame, { west: outside.lng, north: outside.lat, east: inside.lng, south: inside.lat }),
    ).toEqual({
      rowStart: 0,
      rowEnd: 2,
      colStart: 0,
      colEnd: 2,
    });

    const farWest = fromMercator(frame.originX + 20_000, frame.originY - 100);
    const farEast = fromMercator(frame.originX + 21_000, frame.originY - 1100);
    expect(cellWindow(frame, { west: farWest.lng, south: farEast.lat, east: farEast.lng, north: farWest.lat })).toBeNull();
  });

  it("measures how far the declared south-east corner is from the meter grid", () => {
    const frame = equatorFrame();
    const footprint = gridFootprint(frame);
    expect(footprint.west).toBeCloseTo(0, 6);
    expect(footprint.north).toBeCloseTo(0, 6);
    const southEastX = frame.originX + frame.cols * frame.cellWidth;
    const southEastY = frame.originY - frame.rows * frame.cellHeight;
    const southEast = fromMercator(southEastX, southEastY);
    expect(footprint.east).toBeCloseTo(southEast.lng, 6);
    expect(footprint.south).toBeCloseTo(southEast.lat, 6);

    const declaredSouth = fromMercator(southEastX, southEastY + 1000);
    const drift = footprintDriftMeters(
      { west: 0, north: 0, east: southEast.lng, south: declaredSouth.lat },
      frame,
    );
    expect(drift.east).toBeCloseTo(0, 3);
    expect(drift.south).toBeCloseTo(-1000, 3);
  });

  it("places cell 0,0 at the south-west corner when rowOrigin is south", () => {
    const frame = createGridFrame({
      bounds: { west: 0, south: 0, east: 0, north: 0 },
      cellSize: { width: 1000, height: 1000 },
      rows: 10,
      cols: 10,
      rowOrigin: "south",
    });
    if (frame.kind !== "uniform") throw new Error("expected a uniform frame");
    expect(frame.rowOrigin).toBe("south");
    const origin = toMercator(0, 0);
    expect(frame.originX).toBeCloseTo(origin.x, 4);
    expect(frame.originY).toBeCloseTo(origin.y, 4);
    const inside = fromMercator(frame.originX + 100, frame.originY + 100);
    const next = fromMercator(frame.originX + 1500, frame.originY + 1500);
    expect(cellIndex(frame, inside.lng, inside.lat)).toEqual({ row: 0, col: 0 });
    expect(cellIndex(frame, next.lng, next.lat)).toEqual({ row: 1, col: 1 });
  });

  it("divides bounds into equal degree steps with row 0 at the north", () => {
    const frame = createGridFrame({
      bounds: { west: 10, south: 20, east: 12, north: 22 },
      cellSize: { width: 1, height: 1 },
      rows: 2,
      cols: 2,
      placement: "geographic",
    });
    if (frame.kind !== "geographic") throw new Error("expected a geographic frame");
    expect(frame.rowOrigin).toBe("north");
    expect(gridFootprint(frame)).toEqual({ west: 10, south: 20, east: 12, north: 22 });
    expect(cellIndex(frame, 10.1, 21.1)).toEqual({ row: 0, col: 0 });
    expect(cellIndex(frame, 11.1, 21.1)).toEqual({ row: 0, col: 1 });
    expect(cellIndex(frame, 10.1, 20.1)).toEqual({ row: 1, col: 0 });
    expect(cellIndex(frame, 12, 22)).toEqual({ row: 0, col: 1 });
    expect(cellIndex(frame, 10, 20)).toEqual({ row: 1, col: 0 });
    expect(cellIndex(frame, 9.9, 20.5)).toBeNull();
    expect(cellWindow(frame, { west: 9, south: 19, east: 10.2, north: 20.2 })).toEqual({
      rowStart: 1,
      rowEnd: 2,
      colStart: 0,
      colEnd: 1,
    });
  });

  it("keeps geographic row 0 at the south when rowOrigin is south", () => {
    const frame = createGridFrame({
      bounds: { west: 10, south: 20, east: 12, north: 22 },
      cellSize: { width: 1, height: 1 },
      rows: 2,
      cols: 2,
      placement: "geographic",
      rowOrigin: "south",
    });
    expect(cellIndex(frame, 10.1, 20.1)).toEqual({ row: 0, col: 0 });
    expect(cellIndex(frame, 11.1, 20.1)).toEqual({ row: 0, col: 1 });
    expect(cellIndex(frame, 10.1, 21.1)).toEqual({ row: 1, col: 0 });
    expect(cellIndex(frame, 12, 22)).toEqual({ row: 1, col: 1 });
    expect(cellWindow(frame, { west: 9, south: 19, east: 10.2, north: 20.2 })).toEqual({
      rowStart: 0,
      rowEnd: 1,
      colStart: 0,
      colEnd: 1,
    });
  });

  it("snaps an aligned grid to the EPSG:3857 origin and starts row 0 at the north", () => {
    const southWest = fromMercator(11, 11);
    const northEast = fromMercator(25, 25);
    const centerLat = (southWest.lat + northEast.lat) / 2;
    const ground = 10 * Math.cos((centerLat * Math.PI) / 180);
    const frame = createGridFrame({
      bounds: { west: southWest.lng, south: southWest.lat, east: northEast.lng, north: northEast.lat },
      cellSize: { width: ground, height: ground },
      rows: 2,
      cols: 2,
      placement: "aligned",
    });
    if (frame.kind !== "uniform") throw new Error("expected a uniform frame");
    expect(frame.rowOrigin).toBe("north");
    expect(frame.originX).toBeCloseTo(10, 4);
    expect(frame.originY).toBeCloseTo(30, 4);
    expect(cellIndex(frame, fromMercator(10.5, 29.5).lng, fromMercator(10.5, 29.5).lat)).toEqual({
      row: 0,
      col: 0,
    });
    expect(cellIndex(frame, fromMercator(20.5, 19.5).lng, fromMercator(20.5, 19.5).lat)).toEqual({
      row: 1,
      col: 1,
    });
    expect(cellIndex(frame, fromMercator(9.5, 29.5).lng, fromMercator(9.5, 29.5).lat)).toBeNull();
  });

  it("snaps an aligned grid from the south when rowOrigin is south", () => {
    const southWest = fromMercator(11, 11);
    const northEast = fromMercator(25, 25);
    const centerLat = (southWest.lat + northEast.lat) / 2;
    const ground = 10 * Math.cos((centerLat * Math.PI) / 180);
    const frame = createGridFrame({
      bounds: { west: southWest.lng, south: southWest.lat, east: northEast.lng, north: northEast.lat },
      cellSize: { width: ground, height: ground },
      rows: 2,
      cols: 2,
      placement: "aligned",
      rowOrigin: "south",
    });
    if (frame.kind !== "uniform") throw new Error("expected a uniform frame");
    expect(frame.rowOrigin).toBe("south");
    expect(frame.originX).toBeCloseTo(10, 4);
    expect(frame.originY).toBeCloseTo(10, 4);
    expect(cellIndex(frame, fromMercator(10.5, 10.5).lng, fromMercator(10.5, 10.5).lat)).toEqual({
      row: 0,
      col: 0,
    });
    expect(cellIndex(frame, fromMercator(20.5, 20.5).lng, fromMercator(20.5, 20.5).lat)).toEqual({
      row: 1,
      col: 1,
    });
  });
});

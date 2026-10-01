import type { CellSizeMeters, GridPlacement, LngLatBounds, RowOrigin } from "./types.js";

/** Web Mercator sphere radius in meters. Matches EPSG:3857 and Leaflet. */
export const EARTH_RADIUS_M = 6_378_137;

const WORLD_WIDTH_M = 2 * Math.PI * EARTH_RADIUS_M;
const SNAP_EPSILON = 1e-8;

export interface GridSpec {
  bounds: LngLatBounds;
  cellSize: CellSizeMeters;
  rows: number;
  cols: number;
  placement?: GridPlacement;
  /** Which edge row 0 touches. Defaults to `"north"`. */
  rowOrigin?: RowOrigin;
}

export interface UniformGridFrame {
  kind: "uniform";
  /** `north`: row 0 touches the north edge. `south`: row 0 touches the south edge. */
  rowOrigin: "north" | "south";
  /** Mercator X of the west edge, EPSG:3857 meters. */
  originX: number;
  /** Mercator Y of the row-0 outer edge. North edge when `rowOrigin` is `north`, south edge otherwise. */
  originY: number;
  rows: number;
  cols: number;
  /** Cell width in EPSG:3857 meters. */
  cellWidth: number;
  /** Cell height in EPSG:3857 meters. */
  cellHeight: number;
  /** cos(center latitude). Converts projected meters toward ground meters. */
  groundScale: number;
}

export interface GeographicGridFrame {
  kind: "geographic";
  /** `north`: row 0 touches the north edge. `south`: row 0 touches the south edge. */
  rowOrigin: RowOrigin;
  west: number;
  south: number;
  east: number;
  north: number;
  rows: number;
  cols: number;
}

export type GridFrame = UniformGridFrame | GeographicGridFrame;

export interface IndexWindow {
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
}

export function toMercator(lng: number, lat: number): { x: number; y: number } {
  const latRad = (lat * Math.PI) / 180;
  return {
    x: EARTH_RADIUS_M * lng * (Math.PI / 180),
    y: EARTH_RADIUS_M * Math.atanh(Math.sin(latRad)),
  };
}

export function fromMercator(x: number, y: number): { lng: number; lat: number } {
  return {
    lng: (x / EARTH_RADIUS_M) * (180 / Math.PI),
    lat: Math.asin(Math.tanh(y / EARTH_RADIUS_M)) * (180 / Math.PI),
  };
}

/**
 * Builds the grid frame according to `spec.placement`
 * (see the GridPlacement type description). Defaults to `"projected"`.
 */
export function createGridFrame(spec: GridSpec): GridFrame {
  const placement = spec.placement ?? "projected";
  if (placement === "geographic") return geographicFrame(spec);
  if (placement === "aligned") return alignedFrame(spec);
  return projectedFrame(spec);
}

export function gridFootprint(frame: GridFrame): LngLatBounds {
  if (frame.kind === "geographic") {
    return { west: frame.west, south: frame.south, east: frame.east, north: frame.north };
  }
  const southY = frame.rowOrigin === "north" ? frame.originY - frame.rows * frame.cellHeight : frame.originY;
  const northY = frame.rowOrigin === "north" ? frame.originY : frame.originY + frame.rows * frame.cellHeight;
  const northWest = fromMercator(frame.originX, northY);
  const southEast = fromMercator(frame.originX + frame.cols * frame.cellWidth, southY);
  return {
    west: northWest.lng,
    north: northWest.lat,
    east: southEast.lng,
    south: southEast.lat,
  };
}

export function footprintDriftMeters(
  declared: LngLatBounds,
  frame: GridFrame,
): { east: number; south: number } {
  const actual = gridFootprint(frame);
  const declaredCorner = toMercator(declared.east, declared.south);
  const actualCorner = toMercator(actual.east, actual.south);
  const centerLat = (declared.south + declared.north) / 2;
  const scale = frame.kind === "uniform" ? frame.groundScale : Math.cos((centerLat * Math.PI) / 180);
  return {
    east: (actualCorner.x - declaredCorner.x) * scale,
    south: (actualCorner.y - declaredCorner.y) * scale,
  };
}

export function cellIndex(
  frame: GridFrame,
  lng: number,
  lat: number,
): { row: number; col: number } | null {
  if (frame.kind === "geographic") return geographicIndex(frame, lng, lat);
  const point = toMercator(lng, lat);
  return cellIndexProjected(frame, point.x, point.y);
}

export function cellIndexProjected(
  frame: UniformGridFrame,
  x: number,
  y: number,
): { row: number; col: number } | null {
  const col = Math.floor((x - frame.originX) / frame.cellWidth);
  const row =
    frame.rowOrigin === "north"
      ? Math.floor((frame.originY - y) / frame.cellHeight)
      : Math.floor((y - frame.originY) / frame.cellHeight);
  if (row < 0 || col < 0 || row >= frame.rows || col >= frame.cols) return null;
  return { row, col };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function cellWindow(frame: GridFrame, view: LngLatBounds): IndexWindow | null {
  if (frame.kind === "geographic") return geographicWindow(frame, view);
  const west = toMercator(view.west, 0).x;
  let east = toMercator(view.east, 0).x;
  if (east < west) east += WORLD_WIDTH_M;
  const north = toMercator(0, view.north).y;
  const south = toMercator(0, view.south).y;
  const colStart = clamp(Math.floor((west - frame.originX) / frame.cellWidth), 0, frame.cols);
  const colEnd = clamp(Math.ceil((east - frame.originX) / frame.cellWidth), 0, frame.cols);
  const rowStart = clamp(rowStartAt(frame, south, north), 0, frame.rows);
  const rowEnd = clamp(rowEndAt(frame, south, north), 0, frame.rows);
  if (colStart >= colEnd || rowStart >= rowEnd) return null;
  return { rowStart, rowEnd, colStart, colEnd };
}

/** Mercator-projected grid: cellSize in meters → projection meters via cos(latitude). `"north"` anchors the north-west corner and grows rows downward; `"south"` anchors the south-west corner and grows rows upward. */
function projectedFrame(spec: GridSpec): UniformGridFrame {
  const rowOrigin = spec.rowOrigin ?? "north";
  const centerLat = (spec.bounds.south + spec.bounds.north) / 2;
  const anchorLat = rowOrigin === "north" ? spec.bounds.north : spec.bounds.south;
  const origin = toMercator(spec.bounds.west, anchorLat);
  const groundScale = Math.cos((centerLat * Math.PI) / 180);
  return {
    kind: "uniform",
    rowOrigin,
    originX: origin.x,
    originY: origin.y,
    rows: spec.rows,
    cols: spec.cols,
    cellWidth: spec.cellSize.width / groundScale,
    cellHeight: spec.cellSize.height / groundScale,
    groundScale,
  };
}

/** Like projected, but the anchor corner is snapped outward onto the EPSG:3857 cell lattice so neighboring extents line up without drift. */
function alignedFrame(spec: GridSpec): UniformGridFrame {
  const rowOrigin = spec.rowOrigin ?? "north";
  const centerLat = (spec.bounds.south + spec.bounds.north) / 2;
  const groundScale = Math.cos((centerLat * Math.PI) / 180);
  const cellWidth = spec.cellSize.width / groundScale;
  const cellHeight = spec.cellSize.height / groundScale;
  const anchorLat = rowOrigin === "north" ? spec.bounds.north : spec.bounds.south;
  const anchor = toMercator(spec.bounds.west, anchorLat);
  const originY =
    rowOrigin === "north" ? snapUp(anchor.y, cellHeight) * cellHeight : snapDown(anchor.y, cellHeight) * cellHeight;
  return {
    kind: "uniform",
    rowOrigin,
    originX: snapDown(anchor.x, cellWidth) * cellWidth,
    originY,
    rows: spec.rows,
    cols: spec.cols,
    cellWidth,
    cellHeight,
    groundScale,
  };
}

/** Grid splits bounds evenly in degrees (WGS84), no projection; cellSize in meters is not used. */
function geographicFrame(spec: GridSpec): GeographicGridFrame {
  return {
    kind: "geographic",
    rowOrigin: spec.rowOrigin ?? "north",
    west: spec.bounds.west,
    south: spec.bounds.south,
    east: spec.bounds.east,
    north: spec.bounds.north,
    rows: spec.rows,
    cols: spec.cols,
  };
}

function geographicIndex(
  frame: GeographicGridFrame,
  lng: number,
  lat: number,
): { row: number; col: number } | null {
  if (frame.cols <= 0 || frame.rows <= 0) return null;
  if (lng < frame.west || lng > frame.east || lat < frame.south || lat > frame.north) return null;
  const colSpan = (frame.east - frame.west) / frame.cols;
  const rowSpan = (frame.north - frame.south) / frame.rows;
  if (!(colSpan > 0) || !(rowSpan > 0)) return null;
  let col = Math.floor((lng - frame.west) / colSpan);
  const row = geographicRow(frame, lat, rowSpan);
  if (col === frame.cols && lng <= frame.east) col = frame.cols - 1;
  if (row < 0 || col < 0 || row >= frame.rows || col >= frame.cols) return null;
  return { row, col };
}

function geographicWindow(frame: GeographicGridFrame, view: LngLatBounds): IndexWindow | null {
  if (frame.cols <= 0 || frame.rows <= 0) return null;
  const colSpan = (frame.east - frame.west) / frame.cols;
  const rowSpan = (frame.north - frame.south) / frame.rows;
  if (!(colSpan > 0) || !(rowSpan > 0)) return null;
  let east = view.east;
  if (east < view.west) east += 360;
  const colStart = clamp(Math.floor((view.west - frame.west) / colSpan), 0, frame.cols);
  const colEnd = clamp(Math.ceil((east - frame.west) / colSpan), 0, frame.cols);
  const rows = geographicWindowRows(frame, view.south, view.north, rowSpan);
  const rowStart = clamp(rows.rowStart, 0, frame.rows);
  const rowEnd = clamp(rows.rowEnd, 0, frame.rows);
  if (colStart >= colEnd || rowStart >= rowEnd) return null;
  return { rowStart, rowEnd, colStart, colEnd };
}

function geographicRow(frame: GeographicGridFrame, lat: number, rowSpan: number): number {
  if (frame.rowOrigin === "south") {
    const row = Math.floor((lat - frame.south) / rowSpan);
    if (row === frame.rows && lat <= frame.north) return frame.rows - 1;
    return row;
  }
  const row = Math.floor((frame.north - lat) / rowSpan);
  if (row === frame.rows && lat >= frame.south) return frame.rows - 1;
  return row;
}

function geographicWindowRows(
  frame: GeographicGridFrame,
  viewSouth: number,
  viewNorth: number,
  rowSpan: number,
): { rowStart: number; rowEnd: number } {
  if (frame.rowOrigin === "south") {
    return {
      rowStart: Math.floor((viewSouth - frame.south) / rowSpan),
      rowEnd: Math.ceil((viewNorth - frame.south) / rowSpan),
    };
  }
  return {
    rowStart: Math.floor((frame.north - viewNorth) / rowSpan),
    rowEnd: Math.ceil((frame.north - viewSouth) / rowSpan),
  };
}

function rowStartAt(frame: UniformGridFrame, ySouth: number, yNorth: number): number {
  if (frame.rowOrigin === "north") return Math.floor((frame.originY - yNorth) / frame.cellHeight);
  return Math.floor((ySouth - frame.originY) / frame.cellHeight);
}

function rowEndAt(frame: UniformGridFrame, ySouth: number, yNorth: number): number {
  if (frame.rowOrigin === "north") return Math.ceil((frame.originY - ySouth) / frame.cellHeight);
  return Math.ceil((yNorth - frame.originY) / frame.cellHeight);
}

function snapDown(value: number, cell: number): number {
  return snapToLattice(value, cell, Math.floor);
}

function snapUp(value: number, cell: number): number {
  return snapToLattice(value, cell, Math.ceil);
}

function snapToLattice(value: number, cell: number, away: (quotient: number) => number): number {
  const quotient = value / cell;
  const nearest = Math.round(quotient);
  if (Math.abs(quotient - nearest) <= SNAP_EPSILON) return nearest;
  return away(quotient);
}

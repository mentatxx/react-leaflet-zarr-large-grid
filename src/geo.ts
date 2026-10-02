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

/**
 * Equal longitude and latitude steps, each cell stored as its EPSG:3857 box.
 * Matches grid-builder's Zarr cover: projected row height grows toward the pole.
 */
export interface CoverGridFrame {
  kind: "cover";
  /** `north`: row 0 touches the north edge. `south`: row 0 touches the south edge. */
  rowOrigin: RowOrigin;
  west: number;
  south: number;
  east: number;
  north: number;
  rows: number;
  cols: number;
  /** Column edges in EPSG:3857 meters, west to east. Length is `cols + 1`. */
  xEdges: Float64Array;
  /** Latitude-band edges in EPSG:3857 meters, south to north. Length is `rows + 1`. */
  yEdges: Float64Array;
}

export type GridFrame = UniformGridFrame | GeographicGridFrame | CoverGridFrame;

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
  if (placement === "cover") return coverFrame(spec);
  return projectedFrame(spec);
}

export function gridFootprint(frame: GridFrame): LngLatBounds {
  if (frame.kind !== "uniform") {
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
  if (frame.kind === "cover") return cellIndexCover(frame, point.x, point.y);
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

export function cellIndexCover(
  frame: CoverGridFrame,
  x: number,
  y: number,
): { row: number; col: number } | null {
  const col = cellAt(frame.xEdges, x);
  const band = cellAt(frame.yEdges, y);
  if (col === null || band === null) return null;
  const row = frame.rowOrigin === "south" ? band : frame.rows - 1 - band;
  if (row < 0 || row >= frame.rows) return null;
  return { row, col };
}

export function cellWindow(frame: GridFrame, view: LngLatBounds): IndexWindow | null {
  if (frame.kind === "geographic") return geographicWindow(frame, view);
  if (frame.kind === "cover") return coverWindow(frame, view);
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

/**
 * Equal degree steps with each corner projected to EPSG:3857, matching
 * grid-builder's Zarr cover. The far edge of the last column and the last
 * latitude band is the bound itself. cellSize is not used.
 */
function coverFrame(spec: GridSpec): CoverGridFrame {
  const { west, south, east, north } = spec.bounds;
  const { rows, cols } = spec;
  const xEdges = degreeEdges(cols, west, east, (lon) => toMercator(lon, 0).x);
  const yEdges = degreeEdges(rows, south, north, (lat) => toMercator(0, lat).y);
  return {
    kind: "cover",
    rowOrigin: spec.rowOrigin ?? "north",
    west,
    south,
    east,
    north,
    rows,
    cols,
    xEdges,
    yEdges,
  };
}

function degreeEdges(count: number, start: number, end: number, project: (value: number) => number): Float64Array {
  const edges = new Float64Array(Math.max(count, 0) + 1);
  if (count <= 0) return edges;
  const span = end - start;
  for (let index = 0; index < count; index += 1) {
    edges[index] = project(start + (index * span) / count);
  }
  edges[count] = project(end);
  return edges;
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

function coverWindow(frame: CoverGridFrame, view: LngLatBounds): IndexWindow | null {
  if (frame.cols <= 0 || frame.rows <= 0) return null;
  const west = toMercator(view.west, 0).x;
  let east = toMercator(view.east, 0).x;
  if (east < west) east += WORLD_WIDTH_M;
  const yNorth = toMercator(0, view.north).y;
  const ySouth = toMercator(0, view.south).y;
  const cols = edgeRange(frame.xEdges, west, east);
  const bands = edgeRange(frame.yEdges, ySouth, yNorth);
  if (!cols || !bands) return null;
  const rows =
    frame.rowOrigin === "south"
      ? { rowStart: bands.start, rowEnd: bands.end }
      : { rowStart: frame.rows - bands.end, rowEnd: frame.rows - bands.start };
  const colStart = clamp(cols.start, 0, frame.cols);
  const colEnd = clamp(cols.end, 0, frame.cols);
  const rowStart = clamp(rows.rowStart, 0, frame.rows);
  const rowEnd = clamp(rows.rowEnd, 0, frame.rows);
  if (colStart >= colEnd || rowStart >= rowEnd) return null;
  return { rowStart, rowEnd, colStart, colEnd };
}

/** Index of the cell that contains `value`. The last edge belongs to the last cell. */
function cellAt(edges: Float64Array, value: number): number | null {
  const last = edges.length - 1;
  if (last <= 0 || !(edges[last] > edges[0])) return null;
  if (value < edges[0] || value > edges[last]) return null;
  if (value === edges[last]) return last - 1;
  let lo = 0;
  let hi = last - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (edges[mid] <= value) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Half-open overlap of [min, max) with the cells between `edges`.
 * A cell that only touches `max` is excluded. A cell that touches `min` is included.
 */
function edgeRange(edges: Float64Array, min: number, max: number): { start: number; end: number } | null {
  const last = edges.length - 1;
  if (last <= 0 || !(max > min) || max <= edges[0] || min >= edges[last]) return null;
  const start = min <= edges[0] ? 0 : cellAt(edges, min);
  if (start === null) return null;
  if (max >= edges[last]) return { start, end: last };
  const atMax = cellAt(edges, max);
  if (atMax === null) return null;
  const end = edges[atMax] === max ? atMax : atMax + 1;
  if (start >= end) return null;
  return { start, end };
}

/** Cells whose projected boxes meet [min, max). The far edge is nudged so a shared boundary counts once. */
export function coverOverlap(edges: Float64Array, min: number, max: number): { lo: number; hi: number } {
  const range = edgeRange(edges, min, max - 1e-9);
  if (!range) return { lo: 0, hi: -1 };
  return { lo: range.start, hi: range.end - 1 };
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

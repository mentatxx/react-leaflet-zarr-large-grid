import type { CellSizeMeters, LngLatBounds } from "./types.js";

export const METERS_PER_DEGREE_LAT = 111_320;

export interface GridSpec {
  bounds: LngLatBounds;
  cellSize: CellSizeMeters;
  rows: number;
  cols: number;
}

export interface GridFrame {
  west: number;
  north: number;
  rows: number;
  cols: number;
  cellWidthDeg: number;
  cellHeightDeg: number;
  metersPerDegLng: number;
}

export interface IndexWindow {
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
}

export function metersPerDegreeLng(latDeg: number): number {
  return METERS_PER_DEGREE_LAT * Math.cos((latDeg * Math.PI) / 180);
}

export function createGridFrame(spec: GridSpec): GridFrame {
  const centerLat = (spec.bounds.south + spec.bounds.north) / 2;
  const lngScale = metersPerDegreeLng(centerLat);
  return {
    west: spec.bounds.west,
    north: spec.bounds.north,
    rows: spec.rows,
    cols: spec.cols,
    cellWidthDeg: spec.cellSize.width / lngScale,
    cellHeightDeg: spec.cellSize.height / METERS_PER_DEGREE_LAT,
    metersPerDegLng: lngScale,
  };
}

export function gridFootprint(frame: GridFrame): LngLatBounds {
  return {
    west: frame.west,
    north: frame.north,
    east: frame.west + frame.cols * frame.cellWidthDeg,
    south: frame.north - frame.rows * frame.cellHeightDeg,
  };
}

export function footprintDriftMeters(
  declared: LngLatBounds,
  frame: GridFrame,
): { east: number; south: number } {
  const actual = gridFootprint(frame);
  return {
    east: (actual.east - declared.east) * frame.metersPerDegLng,
    south: (actual.south - declared.south) * METERS_PER_DEGREE_LAT,
  };
}

export function cellIndex(
  frame: GridFrame,
  lng: number,
  lat: number,
): { row: number; col: number } | null {
  const col = Math.floor((lng - frame.west) / frame.cellWidthDeg);
  const row = Math.floor((frame.north - lat) / frame.cellHeightDeg);
  if (row < 0 || col < 0 || row >= frame.rows || col >= frame.cols) return null;
  return { row, col };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function cellWindow(frame: GridFrame, view: LngLatBounds): IndexWindow | null {
  const colStart = clamp(Math.floor((view.west - frame.west) / frame.cellWidthDeg), 0, frame.cols);
  const colEnd = clamp(Math.ceil((view.east - frame.west) / frame.cellWidthDeg), 0, frame.cols);
  const rowStart = clamp(Math.floor((frame.north - view.north) / frame.cellHeightDeg), 0, frame.rows);
  const rowEnd = clamp(Math.ceil((frame.north - view.south) / frame.cellHeightDeg), 0, frame.rows);
  if (colStart >= colEnd || rowStart >= rowEnd) return null;
  return { rowStart, rowEnd, colStart, colEnd };
}

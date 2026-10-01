import { parseHexColor } from "./color.js";
import {
  cellIndex,
  cellIndexProjected,
  fromMercator,
  toMercator,
  EARTH_RADIUS_M,
  type GridFrame,
  type IndexWindow,
  type UniformGridFrame,
} from "./geo.js";
import type { LngLatBounds, PixelSampling } from "./types.js";

const WORLD_WIDTH_M = 2 * Math.PI * EARTH_RADIUS_M;

export interface ValueWindow {
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
  values: Float64Array;
}

export interface PaintTileOptions {
  width: number;
  height: number;
  tile: LngLatBounds;
  frame: GridFrame;
  window: IndexWindow;
  values: Float64Array;
  palette: (value: number) => string;
  sampling: PixelSampling;
}

export function paintTile(options: PaintTileOptions): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(options.width * options.height * 4);
  const cols = options.window.colEnd - options.window.colStart;
  const valueAt = (row: number, col: number): number => {
    if (
      row < options.window.rowStart ||
      row >= options.window.rowEnd ||
      col < options.window.colStart ||
      col >= options.window.colEnd
    ) {
      return Number.NaN;
    }
    return options.values[(row - options.window.rowStart) * cols + (col - options.window.colStart)] ?? Number.NaN;
  };

  const northWest = toMercator(options.tile.west, options.tile.north);
  const southEast = toMercator(options.tile.east, options.tile.south);
  let eastX = southEast.x;
  if (eastX < northWest.x) eastX += WORLD_WIDTH_M;

  for (let y = 0; y < options.height; y += 1) {
    const yNorth = northWest.y + (y / options.height) * (southEast.y - northWest.y);
    const ySouth = northWest.y + ((y + 1) / options.height) * (southEast.y - northWest.y);
    for (let x = 0; x < options.width; x += 1) {
      const xWest = northWest.x + (x / options.width) * (eastX - northWest.x);
      const xEast = northWest.x + ((x + 1) / options.width) * (eastX - northWest.x);
      const sample =
        options.sampling === "average"
          ? averageCells(options.frame, valueAt, xWest, xEast, ySouth, yNorth)
          : nearestCell(options.frame, valueAt, (xWest + xEast) / 2, (yNorth + ySouth) / 2);
      const offset = (y * options.width + x) * 4;
      if (!Number.isFinite(sample)) continue;
      const rgb = parseHexColor(options.palette(sample));
      if (!rgb) continue;
      pixels[offset] = rgb.r;
      pixels[offset + 1] = rgb.g;
      pixels[offset + 2] = rgb.b;
      pixels[offset + 3] = 255;
    }
  }

  return pixels;
}

function nearestCell(
  frame: GridFrame,
  valueAt: (row: number, col: number) => number,
  x: number,
  y: number,
): number {
  if (frame.kind === "geographic") {
    const point = fromMercator(x, y);
    const index = cellIndex(frame, point.lng, point.lat);
    if (!index) return Number.NaN;
    return valueAt(index.row, index.col);
  }
  const index = cellIndexProjected(frame, x, y);
  if (!index) return Number.NaN;
  return valueAt(index.row, index.col);
}

function averageCells(
  frame: GridFrame,
  valueAt: (row: number, col: number) => number,
  xWest: number,
  xEast: number,
  ySouth: number,
  yNorth: number,
): number {
  const covered =
    frame.kind === "geographic"
      ? geographicCoverage(frame, xWest, xEast, ySouth, yNorth)
      : uniformCoverage(frame, xWest, xEast, ySouth, yNorth);
  let sum = 0;
  let count = 0;
  for (let row = covered.rowLo; row <= covered.rowHi; row += 1) {
    for (let col = covered.colLo; col <= covered.colHi; col += 1) {
      if (row < 0 || col < 0 || row >= frame.rows || col >= frame.cols) continue;
      const value = valueAt(row, col);
      if (!Number.isFinite(value)) continue;
      sum += value;
      count += 1;
    }
  }
  return count === 0 ? Number.NaN : sum / count;
}

function uniformCoverage(
  frame: UniformGridFrame,
  xWest: number,
  xEast: number,
  ySouth: number,
  yNorth: number,
): { rowLo: number; rowHi: number; colLo: number; colHi: number } {
  const colLo = Math.floor((xWest - frame.originX) / frame.cellWidth);
  const colHi = Math.ceil((xEast - frame.originX) / frame.cellWidth - 1e-9) - 1;
  if (frame.rowOrigin === "south") {
    return {
      colLo,
      colHi,
      rowLo: Math.floor((ySouth - frame.originY) / frame.cellHeight),
      rowHi: Math.ceil((yNorth - frame.originY) / frame.cellHeight - 1e-9) - 1,
    };
  }
  return {
    colLo,
    colHi,
    rowLo: Math.floor((frame.originY - yNorth) / frame.cellHeight),
    rowHi: Math.ceil((frame.originY - ySouth) / frame.cellHeight - 1e-9) - 1,
  };
}

function geographicCoverage(
  frame: Extract<GridFrame, { kind: "geographic" }>,
  xWest: number,
  xEast: number,
  ySouth: number,
  yNorth: number,
): { rowLo: number; rowHi: number; colLo: number; colHi: number } {
  const southWest = fromMercator(xWest, ySouth);
  const northEast = fromMercator(xEast, yNorth);
  const colSpan = (frame.east - frame.west) / frame.cols;
  const rowSpan = (frame.north - frame.south) / frame.rows;
  const rowLo =
    frame.rowOrigin === "south"
      ? Math.floor((southWest.lat - frame.south) / rowSpan)
      : Math.floor((frame.north - northEast.lat) / rowSpan);
  const rowHi =
    frame.rowOrigin === "south"
      ? Math.ceil((northEast.lat - frame.south) / rowSpan - 1e-9) - 1
      : Math.ceil((frame.north - southWest.lat) / rowSpan - 1e-9) - 1;
  return {
    colLo: Math.floor((southWest.lng - frame.west) / colSpan),
    colHi: Math.ceil((northEast.lng - frame.west) / colSpan - 1e-9) - 1,
    rowLo,
    rowHi,
  };
}

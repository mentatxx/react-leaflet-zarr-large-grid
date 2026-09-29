import { parseHexColor } from "./color.js";
import { cellIndex, type GridFrame, type IndexWindow } from "./geo.js";
import type { LngLatBounds, PixelSampling } from "./types.js";

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

  for (let y = 0; y < options.height; y += 1) {
    const latNorth = options.tile.north - (y / options.height) * (options.tile.north - options.tile.south);
    const latSouth = options.tile.north - ((y + 1) / options.height) * (options.tile.north - options.tile.south);
    for (let x = 0; x < options.width; x += 1) {
      const lngWest = options.tile.west + (x / options.width) * (options.tile.east - options.tile.west);
      const lngEast = options.tile.west + ((x + 1) / options.width) * (options.tile.east - options.tile.west);
      const sample =
        options.sampling === "average"
          ? averageCells(options.frame, valueAt, lngWest, lngEast, latSouth, latNorth)
          : nearestCell(options.frame, valueAt, (lngWest + lngEast) / 2, (latSouth + latNorth) / 2);
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
  lng: number,
  lat: number,
): number {
  const index = cellIndex(frame, lng, lat);
  if (!index) return Number.NaN;
  return valueAt(index.row, index.col);
}

function averageCells(
  frame: GridFrame,
  valueAt: (row: number, col: number) => number,
  lngWest: number,
  lngEast: number,
  latSouth: number,
  latNorth: number,
): number {
  const colLo = Math.floor((lngWest - frame.west) / frame.cellWidthDeg);
  const colHi = Math.ceil((lngEast - frame.west) / frame.cellWidthDeg - 1e-9) - 1;
  const rowLo = Math.floor((frame.north - latNorth) / frame.cellHeightDeg);
  const rowHi = Math.ceil((frame.north - latSouth) / frame.cellHeightDeg - 1e-9) - 1;
  let sum = 0;
  let count = 0;
  for (let row = rowLo; row <= rowHi; row += 1) {
    for (let col = colLo; col <= colHi; col += 1) {
      if (row < 0 || col < 0 || row >= frame.rows || col >= frame.cols) continue;
      const value = valueAt(row, col);
      if (!Number.isFinite(value)) continue;
      sum += value;
      count += 1;
    }
  }
  return count === 0 ? Number.NaN : sum / count;
}

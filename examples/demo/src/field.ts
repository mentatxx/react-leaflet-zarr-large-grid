import { createGridFrame, gridFootprint, type LngLatBounds } from "react-leaflet-zarr-large-grid";
import * as zarr from "zarrita";

const ROWS = 80;
const COLS = 120;
const CELL_METERS = 20;
const NORTH = 47.72;
const WEST = 39.55;

export interface YieldField {
  store: zarr.Location<Map<string, Uint8Array>>["store"];
  path: string;
  bounds: LngLatBounds;
  cellSize: { width: number; height: number };
  center: [number, number];
}

export async function createYieldField(): Promise<YieldField> {
  const cellSize = { width: CELL_METERS, height: CELL_METERS };
  const roughSouth = NORTH - (ROWS * CELL_METERS) / 111_320;
  const bounds = gridFootprint(
    createGridFrame({
      bounds: { west: WEST, south: roughSouth, east: WEST, north: NORTH },
      cellSize,
      rows: ROWS,
      cols: COLS,
    }),
  );
  const location = zarr.root();
  const array = await zarr.create(location.resolve("yield"), {
    shape: [ROWS, COLS],
    chunkShape: [20, 30],
    dtype: "float32",
    fillValue: Number.NaN,
  });
  const data = new Float32Array(ROWS * COLS);
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const along = col / (COLS - 1);
      const across = row / (ROWS - 1);
      data[row * COLS + col] = 0.5 + 0.5 * Math.sin(along * Math.PI * 3 + across * Math.PI);
    }
  }
  await zarr.set(array, null, { data, shape: [ROWS, COLS], stride: [COLS, 1] });
  return {
    store: location.store,
    path: "yield",
    bounds,
    cellSize,
    center: [(bounds.south + bounds.north) / 2, (bounds.west + bounds.east) / 2],
  };
}

export function rainbowColor(value: number): string {
  const wrapped = value % 1;
  const hue = (wrapped < 0 ? wrapped + 1 : wrapped) * 360;
  const [red, green, blue] = hslToRgb(hue, 1, 0.5);
  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

function hslToRgb(hue: number, saturation: number, lightness: number): [number, number, number] {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const sector = hue / 60;
  const x = chroma * (1 - Math.abs((sector % 2) - 1));
  const match = lightness - chroma / 2;
  const [r, g, b] =
    sector < 1
      ? [chroma, x, 0]
      : sector < 2
        ? [x, chroma, 0]
        : sector < 3
          ? [0, chroma, x]
          : sector < 4
            ? [0, x, chroma]
            : sector < 5
              ? [x, 0, chroma]
              : [chroma, 0, x];
  return [Math.round((r + match) * 255), Math.round((g + match) * 255), Math.round((b + match) * 255)];
}

function channel(value: number): string {
  return value.toString(16).padStart(2, "0");
}

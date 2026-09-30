# react-leaflet-zarr-large-grid

React Leaflet layer that paints a regular 2D Zarr float grid as a heatmap. Tiles are drawn for the visible map area plus a Leaflet tile buffer. Only the Zarr chunks that intersect those tiles are decoded.

## Install

```bash
npm install react-leaflet-zarr-large-grid leaflet react react-dom react-leaflet
```

Peer dependencies: `leaflet@^1.9.0` (1.9.4 is the latest compatible release; Leaflet 2 is not supported by react-leaflet 5), `react@^19`, `react-dom@^19`, `react-leaflet@^5`. The package depends on `zarrita@^0.7.5`.

## Usage

```tsx
import { MapContainer, TileLayer } from "react-leaflet";
import { ReactLeafletZarrGridLayer } from "react-leaflet-zarr-large-grid";

<MapContainer center={[48.7, 37.6]} zoom={15}>
  <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
  <ReactLeafletZarrGridLayer
    store="https://example.com/field.zarr"
    path="yield"
    bounds={() => ({ west: 37.55, south: 48.7, east: 37.58, north: 48.72 })}
    cellSize={() => ({ width: 20, height: 20 })}
    palette={(value) => (value > 5 ? "#2e8b57" : "#d35400")}
    pixelSampling="nearest"
  />
</MapContainer>
```

`store` is a URL (`FetchStore`) or any zarrita readable store. `path` selects an array inside a group. Omit it when the store root is the array itself.

`bounds` and `cellSize` are getters for the current values. The layer calls them while drawing a tile. Memoize them with `useCallback` when the values are stable: a new function identity redraws every tile. They are not functions of zoom.

`palette(value)` returns `#rrggbb`. Range breaks stay in your function. `NaN` and the array `fill_value` are not passed to the palette and stay transparent. Any other string is drawn as transparent.

## Coordinates

Values are a regular grid. Axis 0 runs north to south, axis 1 runs west to east. Cell `(0, 0)` touches the north-west corner of `bounds`.

`bounds` is a WGS84 rectangle in degrees. `cellSize.width` is the east-west size of one cell in meters, `cellSize.height` is the north-south size in meters. Degrees are converted with an equirectangular scale at the latitude of the bounds center (`111320` meters per degree of latitude). That is accurate for a field and is not a continental projection. The grid is axis-aligned: it does not rotate, and it should not cross the antimeridian.

Cell edges are measured from the north-west corner by `cellSize`, not stretched to the south-east corner. If that corner disagrees with `rows * height` and `cols * width` by more than one cell, the layer logs one warning.

## Sampling

`pixelSampling` controls a pixel that covers more than one cell:

- `nearest` (default) reads the cell under the pixel center. One sample per pixel.
- `average` uses the mean of the finite cells the pixel covers, then calls the palette once.

Decoded chunks are kept in an LRU cache (`chunkCacheSize`, default 128) shared by every tile, including the `keepBuffer` ring (default 2). Leaving the map aborts a tile render. A chunk download is cancelled only when no remaining tile still needs it.

## Props

| Prop | Type | Default |
| --- | --- | --- |
| `store` | `string` or zarrita readable store | required |
| `path` | `string` | store root |
| `bounds` | `() => { west, south, east, north }` | required |
| `cellSize` | `() => { width, height }` meters | required |
| `palette` | `(value: number) => string` | required |
| `pixelSampling` | `"nearest"` or `"average"` | `"nearest"` |
| `keepBuffer` | `number` | `2` |
| `opacity` | `number` | Leaflet default |
| `zIndex` | `number` | Leaflet default |
| `pane` | `string` | `"overlayPane"` |
| `chunkCacheSize` | `number` | `128` |
| `onError` | `(error: unknown) => void` |  |

The array must be 2D `float32` or `float64`. Opening errors and dtype or shape mismatches are reported through `onError`. A tile that fails to read calls Leaflet's tile `done(error)` so the map can retry it.

`ZarrGridLayer` is also exported for use without the React wrapper. `createGridFrame` and `gridFootprint` build a rectangle that matches the meter grid, which is what the demo uses.

## Demo

From this repository, with Node.js 18.x, 20.x, or 22 and newer, and npm 9 or newer:

```bash
npm install
npm run demo
```

The demo builds a sine wave in an in-memory Zarr store and paints it with a static rainbow palette. The panel switches `pixelSampling`.

## Development

```bash
npm test
npm run build
```

The published package is ESM plus TypeScript declarations (`dist`). Development uses TypeScript 5.9 because TypeScript 7 does not expose the compiler API that `tsup` needs to emit `.d.ts` files. GitHub Actions runs tests, the library build, and the demo build on Node 18.

## Limitations

No grid rotation, time or vertical dimensions, zoom pyramids, cell outlines, or CRS other than WGS84. react-leaflet 4 is not supported.

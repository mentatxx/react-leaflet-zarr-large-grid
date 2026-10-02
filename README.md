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

`rowOrigin` is `"north"` or `"south"`, or a getter that returns one of those. The default is `"north"`: row 0 touches the north edge. A getter is called while drawing a tile, and a new function identity redraws every tile.

`palette(value)` returns `#rrggbb`. Range breaks stay in your function. `NaN` and the array `fill_value` are not passed to the palette and stay transparent. Any other string is drawn as transparent.

## Coordinates

`placement` chooses how array indices become cells. The default is `projected`. The grid does not rotate, and it should not cross the antimeridian. Web Mercator (EPSG:3857) uses a sphere of radius 6 378 137 m, the same projection Leaflet uses for the map. A ground length `G` becomes `G / cos(φ)` projected meters, where `φ` is the latitude of the bounds center.

`projected` keeps a constant cell size on the map. Axis 1 runs west to east. With the default `rowOrigin` of `"north"`, axis 0 runs north to south and cell `(0, 0)` touches the north-west corner of `bounds`. `"south"` anchors that cell at the south-west corner and grows rows northward. Edges are stepped from the anchor by `cellSize` and are not stretched to the opposite corner. If that corner disagrees with `rows * height` and `cols * width` by more than one cell, the layer logs one warning.

`geographic` divides `bounds` into equal steps of longitude and latitude, one step per column and row. The east and north edges land on `bounds`. Column 0 is the west column. Row 0 is the north row unless `rowOrigin` is `"south"`. `cellSize` is not used to place cells.

`cover` uses those same degree steps and places each cell as the EPSG:3857 rectangle of its own corners, the way `grid-builder` covers a Zarr grid. A longitude step keeps a constant projected width. A latitude step does not: the row height is the Mercator distance between its latitudes and grows toward the pole. The last column and the last latitude band end exactly on `bounds`. `cellSize` is not used to place cells. `rowOrigin: "south"` matches the `south_to_north` axis `grid-builder` stores in Zarr.

`aligned` builds squares in EPSG:3857 and snaps them to the projection origin, the same lattice `grid-builder` uses for a polygon. `cellSize` is the ground side, converted with `1 / cos(φ)`. Lines that already lie on the lattice stay put. With `"north"` the array starts at the snapped north-west corner and row 0 is the northern row. `"south"` snaps the south-west corner and row 0 is the southern row. If `rows` and `cols` do not reach the snapped far corner within one cell, the layer logs one warning.

## Sampling

A tile pixel is a rectangle in EPSG:3857. Latitude is not interpolated linearly across the tile.

`pixelSampling` controls a pixel that covers more than one cell:

- `nearest` (default) reads the cell under the pixel center. One sample per pixel.
- `average` uses the mean of the finite cells whose projected rectangles meet the pixel, then calls the palette once.

Decoded chunks are kept in an LRU cache (`chunkCacheSize`, default 128) shared by every tile, including the `keepBuffer` ring (default 2). Leaving the map aborts a tile render. A chunk download is cancelled only when no remaining tile still needs it.

## Props

| Prop | Type | Default |
| --- | --- | --- |
| `store` | `string` or zarrita readable store | required |
| `path` | `string` | store root |
| `bounds` | `() => { west, south, east, north }` | required |
| `cellSize` | `() => { width, height }` meters | required |
| `palette` | `(value: number) => string` | required |
| `placement` | `"projected"`, `"geographic"`, `"aligned"`, or `"cover"` | `"projected"` |
| `rowOrigin` | `"north"`, `"south"`, or `() =>` one of those | `"north"` |
| `pixelSampling` | `"nearest"` or `"average"` | `"nearest"` |
| `keepBuffer` | `number` | `2` |
| `opacity` | `number` | Leaflet default |
| `zIndex` | `number` | Leaflet default |
| `pane` | `string` | `"overlayPane"` |
| `chunkCacheSize` | `number` | `128` |
| `onError` | `(error: unknown) => void` |  |

The array must be 2D `float32` or `float64`. Opening errors and dtype or shape mismatches are reported through `onError`. A tile that fails to read calls Leaflet's tile `done(error)` so the map can retry it.

`ZarrGridLayer` is also exported for use without the React wrapper. `createGridFrame` and `gridFootprint` build the rectangle for a placement. Pass the same `placement` the layer uses. The demo builds its `projected` rectangle that way.

## Demo

From this repository, with Node.js 18.x, 20.x, or 22 and newer, and npm 9 or newer:

```bash
npm install
npm run demo
```

The demo builds a sine wave in an in-memory Zarr store and paints it with a static rainbow palette. The panel switches `pixelSampling`, `placement`, and `rowOrigin`.

## Development

```bash
npm test
npm run build
```

The published package is ESM plus TypeScript declarations (`dist`). Development uses TypeScript 5.9 because TypeScript 7 does not expose the compiler API that `tsup` needs to emit `.d.ts` files. GitHub Actions runs tests, the library build, and the demo build on Node 18.

## Limitations

No grid rotation, time or vertical dimensions, zoom pyramids, cell outlines, or CRS other than WGS84. react-leaflet 4 is not supported.

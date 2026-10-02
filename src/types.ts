export interface LngLatBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface CellSizeMeters {
  width: number;
  height: number;
}

export type PixelSampling = "nearest" | "average";

/** Which edge of the grid array row 0 touches. */
export type RowOrigin = "north" | "south";

/**
 * How the data grid (rows × cols) is placed on the map.
 *
 * - `"projected"` (default) — the grid is built in Web Mercator projection
 *   (EPSG:3857), the same coordinate system Leaflet uses. The cell size is
 *   specified in ground meters and converted to projection meters via the cosine
 *   of the center latitude (`cellWidth = cellSize.width / cos(lat)`), which
 *   compensates for Mercator's horizontal stretching. With the default
 *   `rowOrigin` of `"north"`, row 0 touches the north edge and the grid grows
 *   downward from the north-west corner of the bounds. `"south"` anchors row 0
 *   at the south-west corner and grows rows upward. Suitable for data originally
 *   defined in a metric system (satellite imagery, radar, DEM).
 *
 * - `"geographic"` — the bounds rectangle is split evenly into rows × cols cells
 *   in degrees (WGS84), without projection or Mercator: cell width = (east - west) / cols,
 *   cell height = (north - south) / rows. The cellSize (meters) parameter is
 *   ignored. Row 0 is the north row unless `rowOrigin` is `"south"`. Suitable
 *   for climate/atmospheric data (GFS, ERA5, etc.) stored on a regular degree grid.
 *
 * - `"cover"` — the same degree steps as `"geographic"`, but each cell is the
 *   EPSG:3857 rectangle of its own corners, the way grid-builder covers a Zarr
 *   grid. Longitude steps stay equal in projected X. Latitude steps do not:
 *   projected row height is the Mercator distance between the two latitudes and
 *   grows toward the pole. The last column and the last latitude band end on
 *   `bounds`. `cellSize` is not used to place cells. Row 0 follows `rowOrigin`;
 *   `"south"` matches a Zarr grid stored with `y_axis: south_to_north`.
 *
 * - `"aligned"` — like `"projected"`, but the origin is snapped to the cell
 *   grid so neighboring extents stay on one lattice. With `"north"` (the
 *   default) the north-west corner is snapped outward and rows grow downward.
 *   With `"south"` the south-west corner is snapped outward and rows grow
 *   upward. This keeps neighboring extents (tiles, zoom levels, overlapping
 *   datasets) on a shared grid without drift, even if their bounds differ
 *   slightly.
 */
export type GridPlacement = "projected" | "geographic" | "aligned" | "cover";

export interface ZarrReadableStore {
  get(
    key: `/${string}`,
    opts?: { signal?: AbortSignal },
  ): Promise<Uint8Array | undefined> | Uint8Array | undefined;
}

export interface ZarrGridLayerProps {
  store: string | ZarrReadableStore;
  path?: string;
  bounds: () => LngLatBounds;
  cellSize: () => CellSizeMeters;
  palette: (value: number) => string;
  placement?: GridPlacement;
  /** Which edge row 0 touches. A getter is read while a tile is drawn. Defaults to `"north"`. */
  rowOrigin?: RowOrigin | (() => RowOrigin);
  pixelSampling?: PixelSampling;
  keepBuffer?: number;
  opacity?: number;
  zIndex?: number;
  pane?: string;
  chunkCacheSize?: number;
  onError?: (error: unknown) => void;
}

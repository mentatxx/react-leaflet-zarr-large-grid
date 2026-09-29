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
  pixelSampling?: PixelSampling;
  keepBuffer?: number;
  opacity?: number;
  zIndex?: number;
  pane?: string;
  chunkCacheSize?: number;
  onError?: (error: unknown) => void;
}

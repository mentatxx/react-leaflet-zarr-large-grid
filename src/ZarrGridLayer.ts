import {
  GridLayer,
  type Coords,
  type DoneCallback,
  type GridLayerOptions,
  type LatLngBounds,
} from "leaflet";
import { ChunkCache, readWindow } from "./chunks.js";
import { cellWindow, createGridFrame, footprintDriftMeters, type GridFrame } from "./geo.js";
import { openFloatArray, type FloatZarrArray } from "./openArray.js";
import { paintTile } from "./paint.js";
import type { LngLatBounds, PixelSampling, RowOrigin, ZarrGridLayerProps } from "./types.js";

type GridLayerInternals = {
  _tileCoordsToBounds(coords: Coords): LatLngBounds;
  _removeTile(key: string): void;
};

const DEFAULT_CACHE_SIZE = 128;

export class ZarrGridLayer extends GridLayer {
  #props: ZarrGridLayerProps;
  #cache: ChunkCache;
  #arrayPromise: Promise<FloatZarrArray> | null = null;
  #openErrorReported = false;
  #boundsWarned = false;
  #controllers = new Map<string, AbortController>();

  constructor(props: ZarrGridLayerProps) {
    const options: GridLayerOptions = {
      keepBuffer: props.keepBuffer ?? 2,
      pane: props.pane ?? "overlayPane",
    };
    if (props.opacity !== undefined) options.opacity = props.opacity;
    if (props.zIndex !== undefined) options.zIndex = props.zIndex;
    super(options);
    this.#props = props;
    this.#cache = new ChunkCache(props.chunkCacheSize ?? DEFAULT_CACHE_SIZE);
  }

  updateProps(next: ZarrGridLayerProps, prev: ZarrGridLayerProps): void {
    this.#props = next;
    if (next.opacity !== undefined && next.opacity !== prev.opacity) this.setOpacity(next.opacity);
    if (next.zIndex !== undefined && next.zIndex !== prev.zIndex) this.setZIndex(next.zIndex);
    if (next.keepBuffer !== undefined && next.keepBuffer !== prev.keepBuffer) {
      (this.options as GridLayerOptions).keepBuffer = next.keepBuffer;
    }

    const sourceChanged = next.store !== prev.store || next.path !== prev.path;
    const cacheSizeChanged = (next.chunkCacheSize ?? DEFAULT_CACHE_SIZE) !== (prev.chunkCacheSize ?? DEFAULT_CACHE_SIZE);
    if (sourceChanged || cacheSizeChanged) {
      this.#resetSource();
      if (cacheSizeChanged) this.#cache = new ChunkCache(next.chunkCacheSize ?? DEFAULT_CACHE_SIZE);
      this.redraw();
      return;
    }

    if (
      next.bounds !== prev.bounds ||
      next.cellSize !== prev.cellSize ||
      next.palette !== prev.palette ||
      (next.placement ?? "projected") !== (prev.placement ?? "projected") ||
      next.rowOrigin !== prev.rowOrigin ||
      (next.pixelSampling ?? "nearest") !== (prev.pixelSampling ?? "nearest") ||
      next.keepBuffer !== prev.keepBuffer
    ) {
      this.#boundsWarned = false;
      this.redraw();
    }
  }

  createTile(coords: Coords, done: DoneCallback): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    const size = this.getTileSize();
    canvas.width = size.x;
    canvas.height = size.y;
    const key = tileKey(coords);
    const controller = new AbortController();
    this.#controllers.set(key, controller);
    this.#renderTile(coords, canvas, controller.signal)
      .then(() => {
        if (controller.signal.aborted) return;
        done(undefined, canvas);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || isAbortError(error)) return;
        done(error instanceof Error ? error : new Error(String(error)), canvas);
      })
      .finally(() => {
        if (this.#controllers.get(key) === controller) this.#controllers.delete(key);
      });
    return canvas;
  }

  _removeTile(key: string): void {
    this.#controllers.get(key)?.abort();
    this.#controllers.delete(key);
    const parent = GridLayer.prototype as unknown as GridLayerInternals;
    parent._removeTile.call(this, key);
  }

  #resetSource(): void {
    for (const controller of this.#controllers.values()) controller.abort();
    this.#controllers.clear();
    this.#cache.clear();
    this.#arrayPromise = null;
    this.#openErrorReported = false;
    this.#boundsWarned = false;
  }

  async #array(): Promise<FloatZarrArray> {
    if (!this.#arrayPromise) {
      const { store, path } = this.#props;
      this.#arrayPromise = openFloatArray(store, path).catch((error: unknown) => {
        this.#arrayPromise = null;
        throw error;
      });
      void this.#arrayPromise.catch((error: unknown) => {
        if (this.#openErrorReported) return;
        this.#openErrorReported = true;
        this.#props.onError?.(error);
      });
    }
    return this.#arrayPromise;
  }

  async #renderTile(coords: Coords, canvas: HTMLCanvasElement, signal: AbortSignal): Promise<void> {
    const array = await this.#array();
    if (signal.aborted) return;
    const declared = this.#props.bounds();
    const cellSize = this.#props.cellSize();
    const frame = createGridFrame({
      bounds: declared,
      cellSize,
      rows: array.shape[0] ?? 0,
      cols: array.shape[1] ?? 0,
      placement: this.#props.placement,
      rowOrigin: resolveRowOrigin(this.#props.rowOrigin),
    });
    this.#warnBounds(declared, frame);
    const leafletBounds = tileBounds(this, coords);
    const view: LngLatBounds = {
      west: leafletBounds.getWest(),
      south: leafletBounds.getSouth(),
      east: leafletBounds.getEast(),
      north: leafletBounds.getNorth(),
    };
    const window = cellWindow(frame, view);
    if (!window) return;
    const values = await readWindow(array, this.#cache, window, signal);
    if (signal.aborted) return;
    const sampling: PixelSampling = this.#props.pixelSampling ?? "nearest";
    const pixels = paintTile({
      width: canvas.width,
      height: canvas.height,
      tile: view,
      frame,
      window,
      values,
      palette: this.#props.palette,
      sampling,
    });
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D context is unavailable.");
    const image = context.createImageData(canvas.width, canvas.height);
    image.data.set(pixels);
    context.putImageData(image, 0, 0);
  }

  #warnBounds(declared: LngLatBounds, frame: GridFrame): void {
    if (this.#boundsWarned || frame.kind !== "uniform") return;
    const drift = footprintDriftMeters(declared, frame);
    const cellWidth = frame.cellWidth * frame.groundScale;
    const cellHeight = frame.cellHeight * frame.groundScale;
    if (Math.abs(drift.east) <= cellWidth && Math.abs(drift.south) <= cellHeight) return;
    this.#boundsWarned = true;
    const anchor =
      frame.rowOrigin === "south"
        ? "Cell edges follow the EPSG:3857 origin. The array starts at the snapped south-west corner."
        : "Cell edges follow the north-west corner and the cell size in meters.";
    console.warn(
      `Zarr grid bounds differ from cell size times shape by ${drift.east.toFixed(1)} m east and ${drift.south.toFixed(1)} m south. ${anchor}`,
    );
  }
}

function resolveRowOrigin(value: ZarrGridLayerProps["rowOrigin"]): RowOrigin {
  if (typeof value === "function") return value();
  return value ?? "north";
}

function tileKey(coords: Coords): string {
  return `${coords.x}:${coords.y}:${coords.z}`;
}

function tileBounds(layer: GridLayer, coords: Coords): LatLngBounds {
  const internals = GridLayer.prototype as unknown as GridLayerInternals;
  return internals._tileCoordsToBounds.call(layer, coords);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

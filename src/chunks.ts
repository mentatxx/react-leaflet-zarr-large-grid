import type { IndexWindow } from "./geo.js";

export interface DecodedChunk {
  data: ArrayLike<number>;
  shape: readonly [number, number];
  stride: readonly [number, number];
}

export interface ChunkSource {
  chunks: number[];
  fillValue: number | null;
  getChunk(
    coords: number[],
    options?: { signal?: AbortSignal },
  ): Promise<{ data: ArrayLike<number>; shape: number[]; stride: number[] }>;
}

export function chunkCoordsForWindow(
  chunkShape: readonly number[],
  window: IndexWindow,
): Array<{ row: number; col: number }> {
  const chunkRows = chunkShape[0] ?? 1;
  const chunkCols = chunkShape[1] ?? 1;
  const row0 = Math.floor(window.rowStart / chunkRows);
  const row1 = Math.floor((window.rowEnd - 1) / chunkRows);
  const col0 = Math.floor(window.colStart / chunkCols);
  const col1 = Math.floor((window.colEnd - 1) / chunkCols);
  const coords: Array<{ row: number; col: number }> = [];
  for (let row = row0; row <= row1; row += 1) {
    for (let col = col0; col <= col1; col += 1) {
      coords.push({ row, col });
    }
  }
  return coords;
}

export function normalizeSample(value: number, fillValue: number | null): number {
  if (!Number.isFinite(value)) return Number.NaN;
  if (fillValue !== null && Object.is(value, fillValue)) return Number.NaN;
  return value;
}

interface Inflight {
  controller: AbortController;
  promise: Promise<DecodedChunk>;
  waiters: number;
}

export class ChunkCache {
  #values = new Map<string, DecodedChunk>();
  #inflight = new Map<string, Inflight>();

  constructor(private maxSize: number) {}

  get size(): number {
    return this.#values.size;
  }

  clear(): void {
    for (const flight of this.#inflight.values()) flight.controller.abort();
    this.#inflight.clear();
    this.#values.clear();
  }

  async get(source: ChunkSource, row: number, col: number, signal: AbortSignal): Promise<DecodedChunk> {
    throwIfAborted(signal);
    const key = `${row}:${col}`;
    const cached = this.#touch(key);
    if (cached) return cached;

    let flight = this.#inflight.get(key);
    if (!flight) {
      const controller = new AbortController();
      const promise = source
        .getChunk([row, col], { signal: controller.signal })
        .then((chunk) => {
          const decoded: DecodedChunk = {
            data: chunk.data,
            shape: [chunk.shape[0] ?? 0, chunk.shape[1] ?? 0],
            stride: [chunk.stride[0] ?? 0, chunk.stride[1] ?? 1],
          };
          this.#inflight.delete(key);
          this.#insert(key, decoded);
          return decoded;
        })
        .catch((error: unknown) => {
          this.#inflight.delete(key);
          throw error;
        });
      flight = { controller, promise, waiters: 0 };
      this.#inflight.set(key, flight);
    }

    flight.waiters += 1;
    let aborted = false;
    const onAbort = () => {
      aborted = true;
      flight.waiters -= 1;
      if (flight.waiters <= 0) flight.controller.abort();
    };
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      const chunk = await flight.promise;
      throwIfAborted(signal);
      return chunk;
    } finally {
      signal.removeEventListener("abort", onAbort);
      if (!aborted) flight.waiters -= 1;
    }
  }

  #touch(key: string): DecodedChunk | undefined {
    const value = this.#values.get(key);
    if (value === undefined) return undefined;
    this.#values.delete(key);
    this.#values.set(key, value);
    return value;
  }

  #insert(key: string, value: DecodedChunk): void {
    if (this.#values.has(key)) this.#values.delete(key);
    this.#values.set(key, value);
    while (this.#values.size > this.maxSize) {
      const oldest = this.#values.keys().next().value;
      if (oldest === undefined) break;
      this.#values.delete(oldest);
    }
  }
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw signal.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError");
  }
}

export async function readWindow(
  source: ChunkSource,
  cache: ChunkCache,
  window: IndexWindow,
  signal: AbortSignal,
): Promise<Float64Array> {
  const rows = window.rowEnd - window.rowStart;
  const cols = window.colEnd - window.colStart;
  const values = new Float64Array(rows * cols);
  values.fill(Number.NaN);
  const chunkRows = source.chunks[0] ?? 1;
  const chunkCols = source.chunks[1] ?? 1;
  const coords = chunkCoordsForWindow(source.chunks, window);

  await Promise.all(
    coords.map(async ({ row: chunkRow, col: chunkCol }) => {
      const chunk = await cache.get(source, chunkRow, chunkCol, signal);
      const originRow = chunkRow * chunkRows;
      const originCol = chunkCol * chunkCols;
      const rowFrom = Math.max(window.rowStart, originRow);
      const rowTo = Math.min(window.rowEnd, originRow + chunk.shape[0]);
      const colFrom = Math.max(window.colStart, originCol);
      const colTo = Math.min(window.colEnd, originCol + chunk.shape[1]);
      for (let row = rowFrom; row < rowTo; row += 1) {
        for (let col = colFrom; col < colTo; col += 1) {
          const localRow = row - originRow;
          const localCol = col - originCol;
          const raw = Number(chunk.data[localRow * chunk.stride[0] + localCol * chunk.stride[1]]);
          values[(row - window.rowStart) * cols + (col - window.colStart)] = normalizeSample(raw, source.fillValue);
        }
      }
    }),
  );

  return values;
}

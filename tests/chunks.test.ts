import { describe, expect, it } from "vitest";
import * as zarr from "zarrita";
import { ChunkCache, chunkCoordsForWindow, readWindow } from "../src/chunks.js";

describe("chunk windows", () => {
  it("lists chunk coordinates that intersect an index window", () => {
    expect(chunkCoordsForWindow([2, 3], { rowStart: 1, rowEnd: 5, colStart: 2, colEnd: 7 })).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
      { row: 1, col: 2 },
      { row: 2, col: 0 },
      { row: 2, col: 1 },
      { row: 2, col: 2 },
    ]);
  });

  it("reads only the requested cells and reuses cached chunks", async () => {
    const location = zarr.root();
    const array = await zarr.create(location, {
      shape: [4, 6],
      chunkShape: [2, 3],
      dtype: "float32",
      fillValue: Number.NaN,
    });
    const data = new Float32Array(24);
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 6; col += 1) data[row * 6 + col] = row * 10 + col;
    }
    data[8] = Number.NaN;
    await zarr.set(array, null, { data, shape: [4, 6], stride: [6, 1] });

    let reads = 0;
    const source = {
      chunks: array.chunks,
      fillValue: array.fillValue,
      getChunk: async (coords: number[], options?: { signal?: AbortSignal }) => {
        reads += 1;
        return array.getChunk(coords, options);
      },
    };
    const cache = new ChunkCache(8);
    const window = { rowStart: 1, rowEnd: 3, colStart: 2, colEnd: 5 };
    const signal = new AbortController().signal;
    const first = await readWindow(source, cache, window, signal);
    const callsAfterFirst = reads;
    const second = await readWindow(source, cache, window, signal);

    expect(Array.from(first)).toEqual([Number.NaN, 13, 14, 22, 23, 24]);
    expect(Array.from(second)).toEqual(Array.from(first));
    expect(callsAfterFirst).toBeGreaterThan(0);
    expect(reads).toBe(callsAfterFirst);
  });
});

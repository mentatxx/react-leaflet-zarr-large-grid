import type { Readable } from "@zarrita/storage";
import { FetchStore, Location, open, type Array as ZarrArray } from "zarrita";
import type { ZarrReadableStore } from "./types.js";

const FLOAT_DTYPES = new Set(["float32", "float64"]);

export type FloatZarrArray = ZarrArray<"float32" | "float64", Readable>;

export async function openFloatArray(
  store: string | ZarrReadableStore,
  path?: string,
  signal?: AbortSignal,
): Promise<FloatZarrArray> {
  const resolved = typeof store === "string" ? new FetchStore(store) : (store as Readable);
  const location = path && path !== "/" ? new Location(resolved, toAbsolutePath(path)) : resolved;
  const array = await open(location, { kind: "array", signal });
  if (array.shape.length !== 2) {
    throw new Error(`Zarr array must be 2-dimensional, received shape [${array.shape.join(", ")}].`);
  }
  if (!FLOAT_DTYPES.has(array.dtype)) {
    throw new Error(`Zarr array dtype must be float32 or float64, received ${array.dtype}.`);
  }
  return array as FloatZarrArray;
}

function toAbsolutePath(path: string): `/${string}` {
  if (path.startsWith("/")) return path as `/${string}`;
  return `/${path}`;
}

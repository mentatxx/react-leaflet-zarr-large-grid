import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [
    "react",
    "react-dom",
    "leaflet",
    "react-leaflet",
    "@react-leaflet/core",
    "zarrita",
  ],
});

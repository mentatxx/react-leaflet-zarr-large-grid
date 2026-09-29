import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const demoDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "react-leaflet-zarr-large-grid": path.resolve(demoDir, "../../src/index.ts"),
    },
    dedupe: ["react", "react-dom", "leaflet"],
  },
  server: {
    port: 5173,
  },
});

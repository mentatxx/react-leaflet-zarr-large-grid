import { use, useState } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import { ReactLeafletZarrGridLayer, type PixelSampling } from "react-leaflet-zarr-large-grid";
import { createYieldField, rainbowColor } from "./field";

const fieldPromise = createYieldField();

export function App() {
  const field = use(fieldPromise);
  const [sampling, setSampling] = useState<PixelSampling>("nearest");

  return (
    <div className="app">
      <MapContainer center={field.center} zoom={15} className="map">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ReactLeafletZarrGridLayer
          store={field.store}
          path={field.path}
          bounds={() => field.bounds}
          cellSize={() => field.cellSize}
          palette={rainbowColor}
          pixelSampling={sampling}
          keepBuffer={2}
        />
      </MapContainer>
      <fieldset className="panel">
        <legend>Pixel sampling</legend>
        <label>
          <input
            type="radio"
            name="sampling"
            checked={sampling === "nearest"}
            onChange={() => setSampling("nearest")}
          />
          Nearest
        </label>
        <label>
          <input
            type="radio"
            name="sampling"
            checked={sampling === "average"}
            onChange={() => setSampling("average")}
          />
          Average
        </label>
      </fieldset>
    </div>
  );
}

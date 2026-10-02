import { use, useState } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import {
  ReactLeafletZarrGridLayer,
  type GridPlacement,
  type PixelSampling,
  type RowOrigin,
} from "react-leaflet-zarr-large-grid";
import { createYieldField, rainbowColor } from "./field";

const fieldPromise = createYieldField();

export function App() {
  const field = use(fieldPromise);
  const [sampling, setSampling] = useState<PixelSampling>("nearest");
  const [placement, setPlacement] = useState<GridPlacement>("projected");
  const [rowOrigin, setRowOrigin] = useState<RowOrigin>("north");

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
          placement={placement}
          rowOrigin={rowOrigin}
          pixelSampling={sampling}
          keepBuffer={2}
        />
      </MapContainer>
      <div className="panel">
        <fieldset>
          <legend>Placement</legend>
          <label>
            <input
              type="radio"
              name="placement"
              checked={placement === "projected"}
              onChange={() => setPlacement("projected")}
            />
            Projected
          </label>
          <label>
            <input
              type="radio"
              name="placement"
              checked={placement === "geographic"}
              onChange={() => setPlacement("geographic")}
            />
            Geographic
          </label>
          <label>
            <input
              type="radio"
              name="placement"
              checked={placement === "aligned"}
              onChange={() => setPlacement("aligned")}
            />
            Aligned
          </label>
          <label>
            <input
              type="radio"
              name="placement"
              checked={placement === "cover"}
              onChange={() => setPlacement("cover")}
            />
            Cover
          </label>
        </fieldset>
        <fieldset>
          <legend>Row origin</legend>
          <label>
            <input
              type="radio"
              name="rowOrigin"
              checked={rowOrigin === "north"}
              onChange={() => setRowOrigin("north")}
            />
            North
          </label>
          <label>
            <input
              type="radio"
              name="rowOrigin"
              checked={rowOrigin === "south"}
              onChange={() => setRowOrigin("south")}
            />
            South
          </label>
        </fieldset>
        <fieldset>
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
    </div>
  );
}

import { createElementObject, createLayerComponent, type LayerProps } from "@react-leaflet/core";
import type { ReactNode } from "react";
import { ZarrGridLayer } from "./ZarrGridLayer.js";
import type { ZarrGridLayerProps } from "./types.js";

export interface ReactLeafletZarrGridLayerProps extends ZarrGridLayerProps, LayerProps {
  children?: ReactNode;
}

export const ReactLeafletZarrGridLayer = createLayerComponent<ZarrGridLayer, ReactLeafletZarrGridLayerProps>(
  function createZarrGridLayer(props, context) {
    return createElementObject(new ZarrGridLayer(props), context);
  },
  function updateZarrGridLayer(instance, props, prevProps) {
    instance.updateProps(props, prevProps);
  },
);

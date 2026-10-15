import { useCallback, useRef, useState } from "react";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";
import GroupLayer from "@arcgis/core/layers/GroupLayer.js";
import WebTileLayer from "@arcgis/core/layers/WebTileLayer.js";
import Camera from "@arcgis/core/Camera.js";
import Point from "@arcgis/core/geometry/Point.js";
import Extent from "@arcgis/core/geometry/Extent.js";
import * as webMercatorUtils from "@arcgis/core/geometry/support/webMercatorUtils.js";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils.js";
import { LAYER_GROUPS } from "../config/layers.js";

// Requests for the Sentinel-2 overlay are limited to the lough and its shore; the tiler 404s for
// tiles outside a scene's footprint and there's nothing of interest beyond this box anyway.
const IMAGERY_EXTENT = webMercatorUtils.geographicToWebMercator(
  new Extent({ xmin: -6.85, ymin: 54.38, xmax: -6.1, ymax: 54.86, spatialReference: { wkid: 4326 } }),
);

export const HOME_CAMERA = {
  position: { longitude: -6.6, latitude: 54.28, z: 24000 },
  heading: 16,
  tilt: 56,
};

/**
 * Owns the SceneView created by <arcgis-scene>: adds the DAERA operational layers, a slot for the
 * Sentinel-2 overlay, probe click handling and camera helpers. Panels never touch the view
 * directly — they get the callbacks returned from here via App.
 */
export function useLoughScene({ onProbeClick }) {
  const viewRef = useRef(null);
  const layersRef = useRef({});
  const imageryRef = useRef(null);
  const [ready, setReady] = useState(false);
  const probeClickRef = useRef(onProbeClick);
  probeClickRef.current = onProbeClick;

  const onViewReady = useCallback((event) => {
    const el = event.target;
    const view = el.view;
    if (!view || viewRef.current === view) return;
    viewRef.current = view;
    const map = el.map;

    // Imagery overlay (Sentinel-2 scene or seasonal composite) sits directly above the basemap so
    // every DAERA vector layer draws on top of it.
    const imagery = new GroupLayer({ title: "Sentinel-2 imagery", listMode: "hide-children", visibilityMode: "independent" });
    imageryRef.current = imagery;
    map.add(imagery);

    // Add groups bottom-up so the first group in config ends up on top in the layer list.
    for (const group of [...LAYER_GROUPS].reverse()) {
      const layers = group.layers.map(({ id, ...props }) => {
        const layer = new FeatureLayer({ ...props, id });
        layersRef.current[id] = layer;
        return layer;
      });
      map.add(new GroupLayer({ id: group.id, title: group.title, visible: group.visible, visibilityMode: "independent", layers: layers.reverse() }));
    }

    // Today's sun, but at midday: real-time lighting would leave the twin in darkness half the time.
    const noon = new Date();
    noon.setUTCHours(12, 30, 0, 0);
    view.environment.lighting = { type: "sun", date: noon, directShadowsEnabled: true };
    view.environment.atmosphereEnabled = true;
    view.popup.dockEnabled = false;
    view.popup.defaultPopupTemplateEnabled = false;

    // Popups are opened manually so a click on a probe goes to the Probes panel instead.
    view.popupEnabled = false;
    view.on("click", async (e) => {
      const probes = layersRef.current.probes;
      const hit = probes ? await view.hitTest(e, { include: [probes] }) : null;
      const ref = hit?.results[0]?.graphic?.attributes?.Probe_Ref_No;
      if (ref) {
        view.closePopup();
        probeClickRef.current?.(ref);
      } else {
        view.openPopup({ location: e.mapPoint, fetchFeatures: true });
      }
    });

    reactiveUtils.whenOnce(() => !view.updating).then(() => setReady(true));
  }, []);

  /** Replace the imagery overlay with a single XYZ tile layer (or clear it with null). */
  const setImagery = useCallback((urlTemplate, { title, copyright } = {}) => {
    const group = imageryRef.current;
    if (!group) return;
    group.removeAll();
    const water = layersRef.current.loughWater;
    if (urlTemplate) {
      group.add(
        new WebTileLayer({
          urlTemplate,
          title,
          fullExtent: IMAGERY_EXTENT,
          copyright: copyright ?? "Contains modified Copernicus Sentinel data, processed by Microsoft Planetary Computer",
        }),
      );
      // The animated water symbol is draped on top of tiles and would hide the overlay.
      if (water) water.visible = false;
    } else if (water) {
      water.visible = true;
    }
  }, []);

  const goTo = useCallback((lon, lat, { z = 9000, tilt = 55, heading } = {}) => {
    const view = viewRef.current;
    if (!view) return;
    view.goTo(
      { target: new Point({ longitude: lon, latitude: lat }), zoom: undefined, tilt, heading: heading ?? view.camera.heading, scale: z * 4 },
      { duration: 1600 },
    );
  }, []);

  const goHome = useCallback(() => {
    viewRef.current?.goTo(new Camera(HOME_CAMERA), { duration: 1600 });
  }, []);

  const setSceneWeather = useCallback((weather) => {
    const view = viewRef.current;
    if (view && weather) view.environment.weather = weather;
  }, []);

  const setLayerVisible = useCallback((id, visible) => {
    const layer = layersRef.current[id];
    if (layer) {
      layer.visible = visible;
      if (visible && layer.parent && "visible" in layer.parent) layer.parent.visible = true;
    }
  }, []);

  return { onViewReady, ready, setImagery, goTo, goHome, setSceneWeather, setLayerVisible };
}

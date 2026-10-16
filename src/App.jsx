import { useCallback, useEffect, useMemo, useState } from "react";

import "@arcgis/map-components/components/arcgis-scene";
import "@arcgis/map-components/components/arcgis-zoom";
import "@arcgis/map-components/components/arcgis-navigation-toggle";
import "@arcgis/map-components/components/arcgis-compass";
import "@arcgis/map-components/components/arcgis-home";
import "@arcgis/map-components/components/arcgis-basemap-toggle";
import "@arcgis/map-components/components/arcgis-layer-list";
import "@arcgis/map-components/components/arcgis-legend";
import "@arcgis/map-components/components/arcgis-expand";
import "@esri/calcite-components/components/calcite-shell";
import "@esri/calcite-components/components/calcite-shell-panel";
import "@esri/calcite-components/components/calcite-panel";
import "@esri/calcite-components/components/calcite-action-bar";
import "@esri/calcite-components/components/calcite-action";
import "@esri/calcite-components/components/calcite-navigation";
import "@esri/calcite-components/components/calcite-navigation-logo";
import "@esri/calcite-components/components/calcite-segmented-control";
import "@esri/calcite-components/components/calcite-segmented-control-item";
import "@esri/calcite-components/components/calcite-select";
import "@esri/calcite-components/components/calcite-option";
import "@esri/calcite-components/components/calcite-button";
import "@esri/calcite-components/components/calcite-notice";
import "@esri/calcite-components/components/calcite-list";
import "@esri/calcite-components/components/calcite-list-item";
import "@esri/calcite-components/components/calcite-icon";
import "@esri/calcite-components/components/calcite-chip";
import "@esri/calcite-components/components/calcite-chip-group";
import "@esri/calcite-components/components/calcite-switch";
import "@esri/calcite-components/components/calcite-label";
import "@esri/calcite-components/components/calcite-loader";
import "@esri/calcite-components/components/calcite-meter";
import "@esri/calcite-components/components/calcite-slider";

import { HOME_CAMERA, useLoughScene } from "./hooks/useLoughScene.js";
import { useSentinel } from "./hooks/useSentinel.js";
import { fetchLatest, fetchProbes } from "./lib/probes.js";
import { bloomConditions, fetchWeather, sceneWeatherFor } from "./lib/weather.js";
import { OverviewPanel } from "./components/OverviewPanel.jsx";
import { SatellitePanel } from "./components/SatellitePanel.jsx";
import { ProbesPanel } from "./components/ProbesPanel.jsx";
import { LayersPanel } from "./components/LayersPanel.jsx";
import { AboutPanel } from "./components/AboutPanel.jsx";

const PANELS = [
  { id: "overview", text: "Today", icon: "dashboard" },
  { id: "satellite", text: "Sentinel-2 algae", icon: "satellite-3" },
  { id: "probes", text: "Probes", icon: "sensor" },
  { id: "layers", text: "Layers", icon: "layers" },
  { id: "about", text: "About", icon: "information" },
];

const PROBE_REFRESH_MS = 15 * 60 * 1000;
const WEATHER_REFRESH_MS = 30 * 60 * 1000;

function usePolling(fn, ms) {
  const [state, setState] = useState(null);
  useEffect(() => {
    let ac = new AbortController();
    const run = () => {
      ac.abort();
      ac = new AbortController();
      fn(ac.signal).then(setState).catch((err) => !ac.signal.aborted && console.warn(err));
    };
    run();
    const id = setInterval(run, ms);
    return () => {
      clearInterval(id);
      ac.abort();
    };
  }, [fn, ms]);
  return state;
}

export function App() {
  const [panel, setPanel] = useState("overview");
  const [selectedProbe, setSelectedProbe] = useState(null);
  const [probes, setProbes] = useState([]);

  const onProbeClick = useCallback((ref) => {
    setSelectedProbe(ref);
    setPanel("probes");
  }, []);

  const scene = useLoughScene({ onProbeClick });
  const sentinel = useSentinel({ enabled: scene.ready, setImagery: scene.setImagery });

  useEffect(() => {
    const ac = new AbortController();
    fetchProbes(ac.signal).then(setProbes).catch(console.warn);
    return () => ac.abort();
  }, []);
  const latest = usePolling(fetchLatest, PROBE_REFRESH_MS);
  const weather = usePolling(fetchWeather, WEATHER_REFRESH_MS);

  useEffect(() => {
    if (scene.ready && weather) scene.setSceneWeather(sceneWeatherFor(weather.current));
  }, [scene.ready, weather, scene.setSceneWeather]);

  // Summarise the three in-lough sondes for the overview and the bloom-conditions index.
  const lakeReadings = useMemo(() => {
    if (!latest || !probes.length) return null;
    const lake = probes.filter((p) => p.inLough).map((p) => latest[p.ref]).filter(Boolean);
    const temps = lake.map((r) => r.Temp?.value).filter(Number.isFinite);
    const pcs = probes
      .filter((p) => p.inLough && latest[p.ref]?.BGA_PC_Fluorescence)
      .map((p) => ({ p, v: latest[p.ref].BGA_PC_Fluorescence.value }));
    const top = pcs.reduce((a, b) => (b.v > (a?.v ?? -Infinity) ? b : a), null);
    const at = Math.max(...lake.flatMap((r) => Object.values(r).map((m) => m.date)));
    return {
      temp: temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null,
      pc: top?.v ?? null,
      pcAt: top ? `at ${top.p.location}` : "",
      at: Number.isFinite(at) ? at : null,
    };
  }, [latest, probes]);

  const conditions = useMemo(
    () => (lakeReadings || weather ? bloomConditions({ waterTemp: lakeReadings?.temp, phycocyanin: lakeReadings?.pc, weather }) : null),
    [lakeReadings, weather],
  );

  const latestClearScene = useMemo(() => [...sentinel.scenes].reverse().find((s) => s.clear >= 0.6) ?? null, [sentinel.scenes]);

  const close = useCallback(() => setPanel(null), []);
  const showScene = useCallback(
    (id) => {
      sentinel.selectScene(id);
      setPanel("satellite");
    },
    [sentinel],
  );
  const zoomToProbe = useCallback((p) => scene.goTo(p.lon, p.lat, { z: 2500, tilt: 60 }), [scene]);

  return (
    <calcite-shell>
      <calcite-navigation slot="header">
        <calcite-navigation-logo
          slot="logo"
          heading="Lough Neagh Environmental Digital Twin"
          description="DAERA monitoring · Copernicus Sentinel-2 · live conditions"
          icon="water"
          heading-level="1"
        />
        <div slot="content-end" className="header-status">
          {lakeReadings?.at && <calcite-chip scale="s" icon="circle-f" appearance="outline" kind="neutral">Sondes live</calcite-chip>}
        </div>
      </calcite-navigation>

      <calcite-shell-panel slot="panel-start" width="l" collapsed={!panel} resizable>
        <calcite-action-bar slot="action-bar" expand-disabled>
          {PANELS.map((p) => (
            <calcite-action key={p.id} text={p.text} icon={p.icon} active={panel === p.id} onClick={() => setPanel((cur) => (cur === p.id ? null : p.id))} />
          ))}
        </calcite-action-bar>
        {panel === "overview" && (
          <OverviewPanel
            conditions={conditions}
            weather={weather}
            lakeReadings={lakeReadings}
            latestScene={latestClearScene}
            onShowScene={showScene}
            onShowLayer={(id) => {
              scene.setLayerVisible(id, true);
              setPanel("layers");
            }}
            onClose={close}
          />
        )}
        {panel === "satellite" && <SatellitePanel sentinel={sentinel} onClose={close} />}
        {panel === "probes" && (
          <ProbesPanel probes={probes} latest={latest} selectedRef={selectedProbe} onSelect={setSelectedProbe} onZoom={zoomToProbe} onClose={close} />
        )}
        {panel === "layers" && <LayersPanel onClose={close} />}
        {panel === "about" && <AboutPanel onClose={close} />}
      </calcite-shell-panel>

      <arcgis-scene
        id="lough-scene"
        basemap="satellite"
        ground="world-elevation"
        camera-position={`${HOME_CAMERA.position.longitude}, ${HOME_CAMERA.position.latitude}, ${HOME_CAMERA.position.z}`}
        camera-tilt={HOME_CAMERA.tilt}
        camera-heading={HOME_CAMERA.heading}
        quality-profile="high"
        onarcgisViewReadyChange={scene.onViewReady}
      >
        <arcgis-zoom slot="top-right" />
        <arcgis-navigation-toggle slot="top-right" />
        <arcgis-compass slot="top-right" />
        <arcgis-home slot="top-right" />
        {/* Legend sits in the view's own UI, under the navigation tools, so it stays visible whichever panel is open. */}
        <arcgis-expand slot="top-right" expanded mode="floating" expand-icon="legend" expand-tooltip="Legend" placement="bottom-end">
          <arcgis-legend className="scene-legend" respect-layer-visibility />
        </arcgis-expand>
        <arcgis-basemap-toggle slot="bottom-right" next-basemap="topo-3d" />
      </arcgis-scene>
    </calcite-shell>
  );
}

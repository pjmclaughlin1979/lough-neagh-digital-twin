# Lough Neagh Environmental Digital Twin

A React + Vite app built on the **ArcGIS Maps SDK for JavaScript 5.1** (`@arcgis/core`,
`@arcgis/map-components`, Calcite 5). It shows a live 3D twin of Lough Neagh and its catchment, combining
DAERA's monitoring network, Copernicus Sentinel-2 Earth observation and weather. It's built to show how
blue-green algae (cyanobacteria) blooms have built up from 2018 to the present.

```bash
npm install
npm run dev            # http://localhost:5180
npm run build          # static build to dist/ (relative base, deployable to any subpath)
npm run bloom-history  # refresh public/data/bloom-history.json (incremental)
```

No API keys or sign-in are needed. Every source is public and anonymous.

## What's in it

| Panel | Contents |
|---|---|
| **Today** | Bloom-conditions index (in-lough water temperature + phycocyanin + 3-day wind and sunshine forecast), live sonde readings, 7-day outlook, latest clear satellite view, BGA reports this year, WFD 2018 status of Lough Neagh and Lough Beg |
| **Sentinel-2 algae** | Chlorophyll-a (NDCI), surface-scum and true-colour overlays for any scene since 2018; the bloom extent of every scene on one timeline (click a dot to load it); summer bloom extent by year; peak-bloom composites per season |
| **Probes** | DAERA's 9 probes: 3 telemetered in-lough sondes (Toome, Washing Bay, Rea's Wood), each with phycocyanin, temperature, DO, turbidity and conductivity, plus 6 river probes on the main inflows. Daily mean and range charts over 30 d to the full record, and a three-sonde comparison |
| **Layers** | The SDK's Layer List with a transparency slider per layer (the Legend sits in the scene, below the navigation tools): live monitoring, water quality & WFD status, catchment pressures (WwTW, algal-bloom pollution incidents), protected sites, catchment |

## Data sources

All DAERA layers come from the public DAERA ArcGIS Online organisation
(`services-eu1.arcgis.com/kswen6BYexuc1SUk`) under the Open Government Licence. See
[`src/config/layers.js`](src/config/layers.js):

- `DAERA_Probes_and_Metrics_Master_Layers_View`: probe sites (layer 0) and about 1.2 M readings (table 1). Daily
  aggregation is done server-side with `groupByFieldsForStatistics=CAST(Date AS DATE)`.
- `BGA_Confirmed_Locations_PublicView`, `LoughNeaghChemistryPhytoplanktonSamplingLocations_3`,
  `Bathing_Water_Monitoring_Points_Public_View_PRD`
- `Lake_Water_Bodies_2016`, `Surface_Water_Body_2018_Status`, `WFD_River_and_Lake_Monitoring_Sites`,
  `Areas_Failing_for_Phosphorus_Only`, `LocalManagementAreas`, `LakeHydrologyStations`
- `NIW_Waste_water_Treatment_Works_Asssets_May_2024`, `Pollution_Incidents_2011_to_2024`
- `SPA`, `SAC`, `ASSI`

**Sentinel-2 L2A** comes through Microsoft Planetary Computer's public STAC and titiler APIs. These are
anonymous and CORS-enabled, and they hold the full archive. Esri's Sentinel-2 Views image service only keeps the last 14
months and needs an ArcGIS login, so it can't show multi-year build-up. The tiler evaluates band-math
expressions server-side, so the browser receives ready-coloured PNG tiles. See [`src/lib/sentinel.js`](src/lib/sentinel.js).

**Open-Meteo** provides current weather and the forecast for the lough centre. It also drives the 3D scene's sky.

## Satellite method

- Only MGRS tile **29UPA** footprints that cover the lough centre are used. That's relative orbits R080 and
  R123; R023 only clips the tile's west edge.
- **NDCI** = (B05 − B04)/(B05 + B04). Chlorophyll-a ≈ 14.04 + 86.12·NDCI + 194.33·NDCI² (Mishra & Mishra 2012,
  indicative only, not calibrated against AFBI/DAERA samples).
- **Scum** = NDVI over water.
- Water mask: MNDWI(B03, B11) > −0.1. It's deliberately loose so dense scum isn't masked as land. Cloud,
  shadow and cirrus are masked from the SCL band.
- Products from **processing baseline ≥ 04.00** (Jan 2022 onwards) carry a +1000 DN offset. The offset is removed
  per item, otherwise indices before and after 2022 aren't comparable. This was checked against raw pixel values.
- **Bloom extent** = share of cloud-free pixels inside the DAERA WFD lough polygon with NDCI ≥ 0.1. The
  script precomputes it via the tiler's `/item/statistics` endpoint. The app also analyses up to 12 newer
  scenes live in the browser.
- **Peak composite** = a `pixel_selection=highest` mosaic of all Jun–Sep scenes for a year.

Cross-year comparisons are indicative, because atmospheric correction over a turbid, hypertrophic lake is uncertain.

## Structure

```
src/
  App.jsx                 Calcite shell, panel state, polling of probes/weather
  hooks/useLoughScene.js  owns the SceneView from <arcgis-scene>: layers, imagery slot, clicks, camera
  hooks/useSentinel.js    bloom history + live top-up, selected scene / composite → imagery layer
  lib/sentinel.js         STAC search, tile URLs, expressions, statistics (shared with the script)
  lib/probes.js           DAERA probe queries          lib/weather.js   Open-Meteo + bloom index
  lib/daera.js            BGA counts, WFD status       config/layers.js all DAERA layer definitions
  components/             panels + dependency-free SVG charts
scripts/build-bloom-history.mjs
public/data/              bloom-history.json, lough-neagh.geojson (generated)
```

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds and publishes to GitHub Pages. The
build needs no secrets. `vite.config.js` uses `base: "./"`, so the same build works at a project subpath.

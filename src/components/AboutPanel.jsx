const SOURCES = [
  ["DAERA water-quality probes (sondes & river loggers)", "https://services-eu1.arcgis.com/kswen6BYexuc1SUk/ArcGIS/rest/services/DAERA_Probes_and_Metrics_Master_Layers_View/FeatureServer", "Telemetered in-lough sondes at Toome, Washing Bay and Rea's Wood measure phycocyanin, temperature, DO, turbidity and conductivity. River probes cover the Six Mile Water, Maine, Moyola, Ballinderry, Blackwater and Upper Bann."],
  ["DAERA blue-green algae confirmed locations", "https://services-eu1.arcgis.com/kswen6BYexuc1SUk/ArcGIS/rest/services/BGA_Confirmed_Locations_PublicView/FeatureServer", "Sites with a confirmed BGA report and the date of the latest one."],
  ["Lough Neagh chemistry & phytoplankton sampling", "https://services-eu1.arcgis.com/kswen6BYexuc1SUk/ArcGIS/rest/services/LoughNeaghChemistryPhytoplanktonSamplingLocations_3/FeatureServer", "Monthly investigative monitoring sites, each linked to DAERA's results dashboard."],
  ["WFD water bodies, status 2018, monitoring sites", "https://services-eu1.arcgis.com/kswen6BYexuc1SUk/ArcGIS/rest/services", "Water Framework Directive lake and river water bodies, classifications, and phosphorus failures."],
  ["Pollution incidents 2011–2024, NI Water WwTW", "https://services-eu1.arcgis.com/kswen6BYexuc1SUk/ArcGIS/rest/services/Pollution_Incidents_2011_to_2024/FeatureServer", "Gridded incident counts (filtered to algal-bloom incidents), plus wastewater treatment works discharge points."],
  ["Local Management Areas, SPA, SAC, ASSI", "https://services-eu1.arcgis.com/kswen6BYexuc1SUk/ArcGIS/rest/services", "The catchment draining to the lough, and protected sites including the Lough Neagh & Lough Beg SPA / Ramsar site."],
  ["Copernicus Sentinel-2 L2A", "https://planetarycomputer.microsoft.com/dataset/sentinel-2-l2a", "Surface reflectance at 10–20 m, every 2–5 days since 2017. Searched and rendered through Microsoft Planetary Computer's public STAC and tiler APIs."],
  ["Open-Meteo", "https://open-meteo.com/", "Current weather and a 7-day forecast for the lough centre; also drives the 3D scene's sky."],
];

export function AboutPanel({ onClose }) {
  return (
    <calcite-panel heading="About this twin" description="Data sources & method" closable oncalcitePanelClose={onClose}>
      <div className="panel-body prose">
        <p>
          An environmental digital twin of Lough Neagh: a live 3D model of the lough and its catchment that brings together DAERA's monitoring
          network, Earth observation and weather. It is built to show how blue-green algae (cyanobacteria) blooms have built up over recent summers.
        </p>
        <h3>Satellite method</h3>
        <ul>
          <li>
            <strong>NDCI</strong> = (B5 − B4) / (B5 + B4), using the 705 nm red-edge band and the 665 nm red band. It rises with chlorophyll-a. Chlorophyll
            is estimated with the Mishra &amp; Mishra (2012) global fit.
          </li>
          <li>
            <strong>Surface scum</strong> = NDVI over water. Positive values mean near-infrared-bright material floating at the surface.
          </li>
          <li>
            Water mask: MNDWI (green vs SWIR) &gt; −0.1, so dense scum isn't masked as land. Clouds, shadow and cirrus are masked with the Sentinel-2 Scene
            Classification Layer.
          </li>
          <li>The +1000 DN offset in products from processing baseline 04.00 (2022) onwards is removed, so indices compare across years.</li>
          <li>
            Bloom extent is the share of cloud-free pixels inside DAERA's WFD Lough Neagh polygon with NDCI ≥ 0.1. It is precomputed for every scene
            since 2018 (<code>npm run bloom-history</code>), and newer scenes are added live in the browser.
          </li>
          <li>The peak composite shows the highest cloud-free NDCI at each pixel across all June–September scenes of a year.</li>
        </ul>
        <h3>Data sources</h3>
        <ul className="sources">
          {SOURCES.map(([name, url, note]) => (
            <li key={name}>
              <a href={url} target="_blank" rel="noopener noreferrer">
                {name}
              </a>
              <span className="muted small">{note}</span>
            </li>
          ))}
        </ul>
        <p className="muted small">
          Contains public sector information licensed under the Open Government Licence v3.0 (DAERA / NIEA). Contains modified Copernicus Sentinel data
          {` ${new Date().getFullYear()}`}. This is a demonstration, not an operational warning service.
        </p>
      </div>
    </calcite-panel>
  );
}

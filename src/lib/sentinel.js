// Sentinel-2 L2A helpers, backed by Microsoft Planetary Computer's public STAC API and its titiler
// data API. Both are anonymous and CORS-enabled, and — unlike Esri's Sentinel-2 Views image service,
// which only keeps the last 14 months — cover the full archive back to 2017, which is what we need to
// look at bloom build-up across several summers.
//
// This module is plain ESM with no browser/Vite dependencies so the offline bloom-history script in
// scripts/ can share the exact same expressions and thresholds as the app.

export const PC_STAC = "https://planetarycomputer.microsoft.com/api/stac/v1";
export const PC_DATA = "https://planetarycomputer.microsoft.com/api/data/v1";
export const COLLECTION = "sentinel-2-l2a";

// The whole of Lough Neagh falls inside this one MGRS tile, so restricting to it avoids partial
// edge-of-swath granules from neighbouring tiles.
export const MGRS_TILE = "29UPA";
export const LOUGH_POINT = [-6.45, 54.6];

// L2A products from processing baseline 04.00 (25 Jan 2022) onwards carry a +1000 DN radiometric
// offset; earlier products don't. Ratio indices must remove it or values aren't comparable across
// years.
export function radiometricOffset(baseline) {
  const v = parseFloat(baseline);
  return Number.isFinite(v) && v >= 4 ? 1000 : 0;
}

// Scene Classification Layer: keep everything except no-data/saturated (0–1), cloud shadow (3),
// cloud medium/high probability (8–9), thin cirrus (10) and snow (11). We deliberately don't keep
// only class 6 (water): dense cyanobacterial scum is often classified as vegetation (4).
const CLEAR = "(SCL>1)&(SCL<8)&(SCL!=3)";

const ndci = (o) => `(B05-B04)/(B05+B04-${2 * o})`;
const ndvi = (o) => `(B08-B04)/(B08+B04-${2 * o})`;
// MNDWI water mask (green vs SWIR). SWIR stays low over water even under surface scum, whereas
// vegetation, soil and urban land sit well below zero. The slightly negative threshold keeps scum.
const water = (o) => `((B03-B11)/(B03+B11-${2 * o})>-0.1)`;

export const MASKED = -9;

// Expressions return MASKED for cloud/land so the tile colormap can make them transparent and the
// statistics histogram range can exclude them.
export const INDICES = {
  ndci: {
    id: "ndci",
    label: "Chlorophyll-a index (NDCI)",
    short: "NDCI",
    description:
      "Normalised Difference Chlorophyll Index, (B5 − B4)/(B5 + B4). The red-edge band rises with chlorophyll-a, so higher values indicate denser phytoplankton / cyanobacteria (Mishra & Mishra, 2012).",
    expression: (o, { maskLand = true } = {}) =>
      `where(${maskLand ? `${water(o)}&` : ""}${CLEAR},${ndci(o)},${MASKED})`,
    range: [-0.1, 0.4],
  },
  scum: {
    id: "scum",
    label: "Surface scum (NDVI over water)",
    short: "Scum",
    description:
      "NDVI over open water. Water normally has negative NDVI; positive values mean near-infrared-reflective material floating at the surface — the signature of cyanobacterial scum.",
    expression: (o, { maskLand = true } = {}) =>
      `where(${maskLand ? `${water(o)}&` : ""}${CLEAR},${ndvi(o)},${MASKED})`,
    range: [0, 0.5],
  },
};

// NDCI → indicative chlorophyll-a (mg m⁻³ ≈ µg L⁻¹), Mishra & Mishra (2012) global fit. Only
// indicative: it hasn't been calibrated against AFBI/DAERA in-situ samples for Lough Neagh.
export function ndciToChl(v) {
  return Math.max(0, 14.039 + 86.115 * v + 194.325 * v * v);
}

// Classes used both for the map colormap and the legend. The ramp steps up in lightness and opacity
// with concentration so low values recede and blooms stand out over the dark water of the basemap.
export const NDCI_CLASSES = [
  { min: -0.1, max: 0.0, label: "Low", color: [16, 72, 92, 110] },
  { min: 0.0, max: 0.05, label: "Moderate", color: [18, 110, 98, 150] },
  { min: 0.05, max: 0.1, label: "Elevated", color: [44, 150, 86, 185] },
  { min: 0.1, max: 0.2, label: "High — bloom", color: [120, 196, 72, 215] },
  { min: 0.2, max: 0.3, label: "Very high", color: [200, 226, 70, 235] },
  { min: 0.3, max: 0.4, label: "Extreme / scum", color: [250, 244, 120, 245] },
];

export const SCUM_CLASSES = [
  { min: 0.0, max: 0.1, label: "Trace", color: [235, 170, 60, 120] },
  { min: 0.1, max: 0.2, label: "Patchy scum", color: [236, 131, 90, 180] },
  { min: 0.2, max: 0.35, label: "Dense scum", color: [208, 59, 59, 220] },
  { min: 0.35, max: 0.5, label: "Very dense", color: [140, 20, 60, 240] },
];

export const BLOOM_THRESHOLD = 0.1; // NDCI ≈ 25 µg/L chl-a
export const HIGH_THRESHOLD = 0.2; // NDCI ≈ 39 µg/L chl-a

// titiler "intervals" colormap. Values are rescaled to 0–255 across `range` first; anything below the
// first class (including MASKED) maps to transparent.
function intervalColormap(classes, [lo, hi]) {
  const scale = (v) => Math.round(((v - lo) / (hi - lo)) * 255);
  const out = [[[0, Math.max(1, scale(classes[0].min))], [0, 0, 0, 0]]];
  classes.forEach((c, i) => {
    const a = Math.max(1, scale(c.min));
    const b = i === classes.length - 1 ? 256 : scale(c.max);
    out.push([[a, b], c.color]);
  });
  return JSON.stringify(out);
}

export function indexClasses(indexId) {
  return indexId === "scum" ? SCUM_CLASSES : NDCI_CLASSES;
}

/** XYZ tile URL template (ArcGIS WebTileLayer placeholders) for one Sentinel-2 item. */
export function itemTileTemplate(item, mode) {
  const base = `${PC_DATA}/item/tiles/WebMercatorQuad/{level}/{col}/{row}@1x.png`;
  const p = new URLSearchParams({ collection: COLLECTION, item: item.id });
  if (mode === "truecolor") {
    p.set("assets", "visual");
    p.set("nodata", "0");
  } else {
    addIndexParams(p, mode, radiometricOffset(item.baseline));
  }
  return `${base}?${p.toString()}`;
}

function addIndexParams(p, mode, offset) {
  const idx = INDICES[mode];
  p.set("expression", idx.expression(offset));
  p.set("asset_as_band", "true");
  p.set("rescale", idx.range.join(","));
  p.set("colormap", intervalColormap(indexClasses(mode), idx.range));
}

// ---------------------------------------------------------------------------------------------
// STAC search

function normaliseItem(f) {
  return {
    id: f.id,
    datetime: f.properties.datetime,
    date: f.properties.datetime.slice(0, 10),
    cloud: f.properties["eo:cloud_cover"],
    baseline: f.properties["s2:processing_baseline"],
    platform: f.properties.platform,
  };
}

/** All 29UPA scenes between two ISO dates under a tile-wide cloud threshold, newest first. */
export async function searchScenes({ start, end, maxCloud = 80, signal, fetchImpl = fetch }) {
  const body = {
    collections: [COLLECTION],
    "filter-lang": "cql2-json",
    filter: {
      op: "and",
      args: [
        { op: "=", args: [{ property: "s2:mgrs_tile" }, MGRS_TILE] },
        // Relative orbit R023 only clips the western edge of 29UPA and misses the lough entirely.
        { op: "s_intersects", args: [{ property: "geometry" }, { type: "Point", coordinates: LOUGH_POINT }] },
        { op: "<=", args: [{ property: "eo:cloud_cover" }, maxCloud] },
        {
          op: "anyinteracts",
          args: [{ property: "datetime" }, { interval: [`${start}T00:00:00Z`, `${end}T23:59:59Z`] }],
        },
      ],
    },
    sortby: [{ field: "datetime", direction: "desc" }],
    limit: 250,
    fields: {
      include: ["id", "properties.datetime", "properties.eo:cloud_cover", "properties.s2:processing_baseline", "properties.platform"],
      exclude: ["assets", "links", "geometry", "bbox"],
    },
  };
  const items = [];
  let next = { url: `${PC_STAC}/search`, body };
  while (next) {
    const res = await fetchImpl(next.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next.body),
      signal,
    });
    if (!res.ok) throw new Error(`STAC search failed (${res.status})`);
    const json = await res.json();
    items.push(...json.features.map(normaliseItem));
    const link = json.links?.find((l) => l.rel === "next");
    // PC returns a POST "next" link whose body carries the paging token (optionally to be merged).
    next = link?.body ? { url: link.href, body: link.merge ? { ...next.body, ...link.body } : link.body } : null;
  }
  return items;
}

// ---------------------------------------------------------------------------------------------
// Per-scene lough statistics

const HIST_RANGE = [-0.3, 0.6];
const HIST_BINS = 45;

/**
 * NDCI statistics inside the lough polygon for one scene. Land is excluded by the polygon itself,
 * so only cloud is masked; masked pixels fall outside the histogram range and are dropped, which
 * lets us derive how much of the lough was actually visible.
 */
export async function sceneStatistics(item, loughFeature, { signal, fetchImpl = fetch } = {}) {
  const o = radiometricOffset(item.baseline);
  const p = new URLSearchParams({
    collection: COLLECTION,
    item: item.id,
    expression: INDICES.ndci.expression(o, { maskLand: false }),
    asset_as_band: "true",
    max_size: "512",
    histogram_bins: String(HIST_BINS),
    histogram_range: HIST_RANGE.join(","),
  });
  const res = await fetchImpl(`${PC_DATA}/item/statistics?${p}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(loughFeature),
    signal,
  });
  if (!res.ok) throw new Error(`statistics ${res.status}`);
  const json = await res.json();
  const s = Object.values(json.properties.statistics)[0];
  return summariseHistogram(s.histogram, s.count);
}

function summariseHistogram([counts, edges], total) {
  const clearPx = counts.reduce((a, b) => a + b, 0);
  if (!clearPx || !total) return { clear: 0 };
  let sum = 0;
  let bloom = 0;
  let high = 0;
  counts.forEach((n, i) => {
    const centre = (edges[i] + edges[i + 1]) / 2;
    sum += n * centre;
    if (edges[i] >= BLOOM_THRESHOLD - 1e-9) bloom += n;
    if (edges[i] >= HIGH_THRESHOLD - 1e-9) high += n;
  });
  // 90th percentile from the cumulative histogram.
  let acc = 0;
  let p90 = edges.at(-1);
  for (let i = 0; i < counts.length; i++) {
    acc += counts[i];
    if (acc >= 0.9 * clearPx) {
      p90 = (edges[i] + edges[i + 1]) / 2;
      break;
    }
  }
  const r = (v, d = 4) => Math.round(v * 10 ** d) / 10 ** d;
  return {
    clear: r(clearPx / total, 3),
    mean: r(sum / clearPx),
    p90: r(p90),
    bloom: r(bloom / clearPx, 3),
    high: r(high / clearPx, 3),
  };
}

// ---------------------------------------------------------------------------------------------
// Seasonal peak composites (max NDCI per pixel across every scene in a window)

export async function registerSeasonMosaic({ start, end, maxCloud = 60, signal }) {
  const res = await fetch(`${PC_DATA}/mosaic/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal,
    body: JSON.stringify({
      collections: [COLLECTION],
      "filter-lang": "cql2-json",
      filter: {
        op: "and",
        args: [
          { op: "=", args: [{ property: "s2:mgrs_tile" }, MGRS_TILE] },
        // Relative orbit R023 only clips the western edge of 29UPA and misses the lough entirely.
        { op: "s_intersects", args: [{ property: "geometry" }, { type: "Point", coordinates: LOUGH_POINT }] },
          { op: "<=", args: [{ property: "eo:cloud_cover" }, maxCloud] },
          {
            op: "anyinteracts",
            args: [{ property: "datetime" }, { interval: [`${start}T00:00:00Z`, `${end}T23:59:59Z`] }],
          },
        ],
      },
      sortby: [{ field: "eo:cloud_cover", direction: "asc" }],
    }),
  });
  if (!res.ok) throw new Error(`mosaic register failed (${res.status})`);
  return (await res.json()).searchid;
}

/**
 * Peak-NDCI composite tiles. Every scene in a single season shares a processing baseline (the
 * offset switch happened in January, outside bloom season), so one offset per year is correct.
 */
export function seasonPeakTileTemplate(searchId, year) {
  const base = `${PC_DATA}/mosaic/${searchId}/tiles/WebMercatorQuad/{level}/{col}/{row}@1x.png`;
  const p = new URLSearchParams({ collection: COLLECTION, pixel_selection: "highest" });
  addIndexParams(p, "ndci", year >= 2022 ? 1000 : 0);
  return `${base}?${p.toString()}`;
}

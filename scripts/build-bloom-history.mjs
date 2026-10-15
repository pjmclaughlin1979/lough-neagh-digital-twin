// Builds public/data/bloom-history.json: per-scene NDCI statistics over Lough Neagh for every
// Sentinel-2 L2A acquisition of tile 29UPA since 2018. The app ships this so the multi-year bloom
// history chart loads instantly, then tops it up live with any scenes newer than the file.
//
// Also writes public/data/lough-neagh.geojson (the WFD water-body outline from DAERA, outer ring
// only, WGS84) which is the polygon the statistics are computed within.
//
//   npm run bloom-history                # incremental: only scenes not already in the file
//   npm run bloom-history -- --full      # recompute everything
//   npm run bloom-history -- --from 2023-01-01

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { searchScenes, sceneStatistics, BLOOM_THRESHOLD, HIGH_THRESHOLD } from "../src/lib/sentinel.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(root, "public/data/bloom-history.json");
const LOUGH_OUT = resolve(root, "public/data/lough-neagh.geojson");
const LAKES =
  "https://services-eu1.arcgis.com/kswen6BYexuc1SUk/ArcGIS/rest/services/Lake_Water_Bodies_2016/FeatureServer/0/query";

const args = process.argv.slice(2);
const full = args.includes("--full");
const from = args.includes("--from") ? args[args.indexOf("--from") + 1] : "2018-01-01";
const CONCURRENCY = 4;

const META = {
  source: "Sentinel-2 L2A (Copernicus) via Microsoft Planetary Computer, MGRS tile 29UPA",
  polygon: "DAERA WFD Lake Water Bodies 2016 — Lough Neagh (UKGBNI3NB0032)",
  index: "NDCI = (B05-B04)/(B05+B04), radiometric offset removed for baseline >= 04.00; SCL cloud/shadow masked",
  fields: {
    clear: "fraction of lough pixels not masked as cloud/shadow",
    mean: "mean NDCI over clear pixels",
    p90: "90th percentile NDCI over clear pixels",
    bloom: `fraction of clear pixels with NDCI >= ${BLOOM_THRESHOLD}`,
    high: `fraction of clear pixels with NDCI >= ${HIGH_THRESHOLD}`,
  },
};

async function loughPolygon() {
  const p = new URLSearchParams({
    where: "namespace='Lough Neagh'",
    outFields: "namespace,localId,Area_km2",
    outSR: "4326",
    maxAllowableOffset: "0.0008",
    geometryPrecision: "5",
    f: "geojson",
  });
  const res = await fetch(`${LAKES}?${p}`);
  if (!res.ok) throw new Error(`DAERA lake query failed ${res.status}`);
  const feature = (await res.json()).features[0];
  // Drop island rings and slivers — statistics just need the open-water outline.
  feature.geometry.coordinates = feature.geometry.coordinates.slice(0, 1);
  return feature;
}

async function withRetry(fn, tries = 4) {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= tries - 1) throw err;
      await new Promise((r) => setTimeout(r, 1500 * 2 ** i));
    }
  }
}

async function main() {
  await mkdir(dirname(OUT), { recursive: true });
  const lough = await loughPolygon();
  await writeFile(LOUGH_OUT, JSON.stringify({ type: "FeatureCollection", features: [lough] }));
  console.log("Lough outline:", lough.geometry.coordinates[0].length, "vertices");

  let existing = { scenes: [] };
  if (!full) {
    try {
      existing = JSON.parse(await readFile(OUT, "utf8"));
    } catch {
      /* first run */
    }
  }
  const done = new Map(existing.scenes.map((s) => [s.id, s]));

  const today = new Date().toISOString().slice(0, 10);
  const items = await searchScenes({ start: from, end: today, maxCloud: 85 });
  const todo = items.filter((it) => !done.has(it.id));
  console.log(`${items.length} scenes found, ${todo.length} to process`);

  const save = async () => {
    const scenes = [...done.values()].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    await writeFile(OUT, JSON.stringify({ ...META, generated: new Date().toISOString(), scenes }));
    return scenes.length;
  };

  let n = 0;
  let failed = 0;
  const queue = [...todo];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) {
        const item = queue.shift();
        try {
          const stats = await withRetry(() => sceneStatistics(item, lough));
          done.set(item.id, { id: item.id, date: item.date, cloud: Math.round(item.cloud), baseline: item.baseline, ...stats });
        } catch (err) {
          failed++;
          console.warn(`  ${item.id}: ${err.message}`);
        }
        if (++n % 50 === 0) {
          await save(); // checkpoint so an interrupted run can resume incrementally
          console.log(`  ${n}/${todo.length}`);
        }
      }
    }),
  );

  const count = await save();
  console.log(`Wrote ${count} scenes (${failed} failed) → ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

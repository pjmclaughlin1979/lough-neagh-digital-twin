// DAERA's water-quality probe network. Layer 0 is the probe sites; table 1 holds every reading
// (≈1.2 M rows, ~30-minute interval) keyed by Probe_Ref_No. Daily aggregation is done server-side
// with a SQL-expression group-by, so even the full multi-year record is one small request.

import { PROBES_URL } from "../config/layers.js";

export const METRICS = {
  BGA_PC_Fluorescence: { label: "Blue-green algae (phycocyanin)", short: "Phycocyanin", unit: "RFU", digits: 2 },
  Temp: { label: "Water temperature", short: "Temperature", unit: "°C", digits: 1 },
  Dissolved_O2_Saturation: { label: "Dissolved oxygen saturation", short: "DO sat.", unit: "%", digits: 0 },
  Dissolved_O2: { label: "Dissolved oxygen", short: "DO", unit: "mg/L", digits: 1 },
  Turbidity: { label: "Turbidity", short: "Turbidity", unit: "NTU", digits: 1 },
  Specific_Conductivity: { label: "Specific conductivity", short: "Conductivity", unit: "µS/cm", digits: 0 },
};

export const METRIC_ORDER = Object.keys(METRICS);

async function query(path, params, signal) {
  const body = new URLSearchParams({ f: "json", ...params });
  const res = await fetch(`${PROBES_URL}/${path}/query`, { method: "POST", body, signal });
  if (!res.ok) throw new Error(`DAERA probes request failed (${res.status})`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || "DAERA probes query error");
  return json.features.map((f) => ({ ...f.attributes, geometry: f.geometry }));
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

export async function fetchProbes(signal) {
  const rows = await query(
    "0",
    { where: "1=1", outFields: "Probe_Ref_No,Location,Probe_Type,Metrics_Collected,Telemetered,Status", outSR: "4326", returnGeometry: "true" },
    signal,
  );
  return rows
    .map((r) => ({
      ref: r.Probe_Ref_No,
      location: r.Location,
      inLough: r.Telemetered === "Y",
      metricsText: r.Metrics_Collected,
      status: r.Status,
      lon: r.geometry?.x,
      lat: r.geometry?.y,
    }))
    .sort((a, b) => Number(b.inLough) - Number(a.inLough) || a.location.localeCompare(b.location));
}

/** Latest reading of every metric for each probe (one request for the whole network). */
export async function fetchLatest(signal) {
  const rows = await query(
    "1",
    {
      where: "1=1",
      groupByFieldsForStatistics: "Probe_Ref_No,Metric_Type",
      outStatistics: JSON.stringify([{ statisticType: "max", onStatisticField: "Date", outStatisticFieldName: "last" }]),
    },
    signal,
  );
  // Fetch the value at each probe/metric's latest timestamp.
  const clauses = rows.map(
    (r) => `(Probe_Ref_No = ${q(r.Probe_Ref_No)} AND Metric_Type = ${q(r.Metric_Type)} AND Date = TIMESTAMP '${toSqlTs(r.last)}')`,
  );
  const values = await query(
    "1",
    { where: clauses.join(" OR "), outFields: "Probe_Ref_No,Metric_Type,Metric_Value,Date", returnGeometry: "false" },
    signal,
  );
  const latest = {};
  for (const v of values) {
    (latest[v.Probe_Ref_No] ??= {})[v.Metric_Type] = { value: v.Metric_Value, date: v.Date };
  }
  return latest;
}

function toSqlTs(ms) {
  return new Date(ms).toISOString().replace("T", " ").slice(0, 19);
}

/** Daily mean/min/max for one probe & metric since `sinceMs`. */
export async function fetchDaily(ref, metric, sinceMs, signal) {
  const where = [`Probe_Ref_No = ${q(ref)}`, `Metric_Type = ${q(metric)}`];
  if (sinceMs) where.push(`Date >= TIMESTAMP '${toSqlTs(sinceMs)}'`);
  const rows = await query(
    "1",
    {
      where: where.join(" AND "),
      groupByFieldsForStatistics: "CAST(Date AS DATE)",
      outStatistics: JSON.stringify([
        { statisticType: "avg", onStatisticField: "Metric_Value", outStatisticFieldName: "v" },
        { statisticType: "min", onStatisticField: "Metric_Value", outStatisticFieldName: "lo" },
        { statisticType: "max", onStatisticField: "Metric_Value", outStatisticFieldName: "hi" },
      ]),
      resultRecordCount: "2000",
    },
    signal,
  );
  return rows
    .map((r) => ({ t: r.EXPR_1, v: r.v, lo: r.lo, hi: r.hi }))
    .filter((p) => p.t != null && Number.isFinite(p.v))
    .sort((a, b) => a.t - b.t);
}

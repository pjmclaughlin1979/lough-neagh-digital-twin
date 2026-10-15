import { DAERA } from "../config/layers.js";

// Catchments (as named in DAERA's BGA reporting layer) that drain to, or out of, Lough Neagh.
const LOUGH_CATCHMENTS = ["Lough Neagh & Peripherals", "Lower Bann", "Lower Bann (Tidal)", "Ballinderry", "Moyola", "Blackwater", "Upper Bann", "Six Mile Water", "Crumlin", "Glenavy"];

async function query(service, params, signal) {
  const res = await fetch(`${DAERA}/${service}/FeatureServer/0/query?${new URLSearchParams({ f: "json", ...params })}`, { signal });
  if (!res.ok) throw new Error(`DAERA ${service} ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json;
}

/** Count of BGA-confirmed sites around Lough Neagh whose latest report is in the given year. */
export async function bgaReportsThisYear(signal) {
  const year = new Date().getFullYear();
  const where = `Catchment IN (${LOUGH_CATCHMENTS.map((c) => `'${c.replace(/'/g, "''")}'`).join(",")})`;
  const [thisYear, total] = await Promise.all([
    query("BGA_Confirmed_Locations_PublicView", { where: `${where} AND DateLatestConfirmedReport >= DATE '${year}-01-01'`, returnCountOnly: "true" }, signal),
    query("BGA_Confirmed_Locations_PublicView", { where, returnCountOnly: "true" }, signal),
  ]);
  return { year, count: thisYear.count, total: total.count };
}

/** WFD 2018 classification of Lough Neagh and Lough Beg. */
export async function loughStatus(signal) {
  const json = await query(
    "Surface_Water_Body_2018_Status",
    { where: "localId IN ('UKGBNI3NB0032','UKGBNI3NB0035')", outFields: "namespace,F2018_statu", returnGeometry: "false" },
    signal,
  );
  return json.features.map((f) => f.attributes);
}

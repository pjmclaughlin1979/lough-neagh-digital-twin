import { useEffect, useMemo, useState } from "react";
import { TimeSeriesChart, fmtDate } from "./charts.jsx";
import { METRICS, METRIC_ORDER, fetchDaily } from "../lib/probes.js";

const RANGES = [
  { id: "30", label: "30 d", days: 30 },
  { id: "90", label: "90 d", days: 90 },
  { id: "365", label: "1 yr", days: 365 },
  { id: "all", label: "All", days: null },
];

// Fixed categorical slots per in-lough probe so a probe keeps its colour whatever is selected.
const PROBE_COLORS = { L1278: "var(--series-1)", L1284: "var(--series-2)", L1279: "var(--series-3)" };

const fmtValue = (metric, v) => (Number.isFinite(v) ? v.toFixed(METRICS[metric]?.digits ?? 1) : "—");

export function ProbesPanel({ probes, latest, selectedRef, onSelect, onZoom, onClose }) {
  const probe = probes.find((p) => p.ref === selectedRef) ?? probes[0];
  const available = useMemo(() => METRIC_ORDER.filter((m) => latest?.[probe?.ref]?.[m]), [latest, probe]);
  const [metric, setMetric] = useState("BGA_PC_Fluorescence");
  const [range, setRange] = useState("90");
  const [compare, setCompare] = useState(false);
  const [series, setSeries] = useState({ status: "idle", data: [] });

  const activeMetric = available.includes(metric) ? metric : available[0];
  const lough = probes.filter((p) => p.inLough);
  const comparing = compare && probe?.inLough;

  useEffect(() => {
    if (!probe || !activeMetric) return;
    const ac = new AbortController();
    const days = RANGES.find((r) => r.id === range).days;
    const since = days ? Date.now() - days * 864e5 : null;
    const targets = comparing ? lough : [probe];
    setSeries((s) => ({ ...s, status: "loading" }));
    Promise.all(targets.map((p) => fetchDaily(p.ref, activeMetric, since, ac.signal).then((points) => ({ p, points }))))
      .then((rows) => setSeries({ status: "ready", data: rows }))
      .catch((err) => !ac.signal.aborted && setSeries({ status: "error", data: [], error: err.message }));
    return () => ac.abort();
    // `lough` is derived from `probes`, which is stable once loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probe?.ref, activeMetric, range, comparing, probes]);

  const meta = METRICS[activeMetric];
  const chartSeries = series.data.map(({ p, points }) => ({
    id: p.ref,
    label: p.location,
    color: PROBE_COLORS[p.ref] ?? "var(--series-1)",
    points,
  }));

  return (
    <calcite-panel heading="Water-quality probes" description="DAERA telemetered sondes & river probes" closable oncalcitePanelClose={onClose}>
      <div className="panel-body">
        <calcite-list label="Probes" selection-mode="single-persist" selection-appearance="border" scale="s">
          {probes.map((p) => {
            const pc = latest?.[p.ref]?.BGA_PC_Fluorescence;
            const t = latest?.[p.ref]?.Temp;
            return (
              <calcite-list-item
                key={p.ref}
                value={p.ref}
                label={p.location}
                description={[t && `${t.value.toFixed(1)} °C`, pc && `${pc.value.toFixed(2)} RFU phycocyanin`, p.inLough ? "in-lough sonde" : "river probe"]
                  .filter(Boolean)
                  .join(" · ")}
                selected={p.ref === probe?.ref}
                oncalciteListItemSelect={() => onSelect(p.ref)}
              >
                <calcite-icon slot="content-start" icon={p.inLough ? "sensor" : "water"} scale="s" />
                <calcite-action slot="actions-end" icon="zoom-to-object" text="Zoom to probe" onClick={() => onZoom(p)} />
              </calcite-list-item>
            );
          })}
        </calcite-list>

        {probe && (
          <section>
            <h3>{probe.location}</h3>
            <div className="metric-chips">
              <calcite-chip-group label="Metric" selection-mode="single-persist" scale="s">
                {available.map((m) => (
                  <calcite-chip key={m} value={m} selected={m === activeMetric} onClick={() => setMetric(m)}>
                    {METRICS[m].short}
                  </calcite-chip>
                ))}
              </calcite-chip-group>
            </div>
            <div className="filter-row">
              <calcite-segmented-control scale="s" oncalciteSegmentedControlChange={(e) => setRange(e.target.value)}>
                {RANGES.map((r) => (
                  <calcite-segmented-control-item key={r.id} value={r.id} checked={range === r.id}>
                    {r.label}
                  </calcite-segmented-control-item>
                ))}
              </calcite-segmented-control>
              {probe.inLough && (
                <calcite-label layout="inline" scale="s">
                  <calcite-switch checked={compare} oncalciteSwitchChange={(e) => setCompare(e.target.checked)} />
                  All 3 lough sondes
                </calcite-label>
              )}
            </div>
            <p className="muted small">
              {meta?.label}, daily {comparing ? "mean per sonde" : "mean with daily range"} ({meta?.unit})
            </p>
            <div className={series.status === "loading" ? "is-refetching" : ""}>
              {series.status === "error" ? (
                <calcite-notice open kind="danger" scale="s">
                  <div slot="message">{series.error}</div>
                </calcite-notice>
              ) : (
                chartSeries.length > 0 && <TimeSeriesChart series={chartSeries} unit={meta?.unit} digits={meta?.digits} />
              )}
            </div>

            <table className="latest-table">
              <caption className="muted small">Latest readings</caption>
              <tbody>
                {available.map((m) => {
                  const r = latest[probe.ref][m];
                  return (
                    <tr key={m}>
                      <th scope="row">{METRICS[m].label}</th>
                      <td>
                        {fmtValue(m, r.value)} {METRICS[m].unit}
                      </td>
                      <td className="muted">{fmtDate(r.date)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {activeMetric === "BGA_PC_Fluorescence" && (
              <p className="muted small">
                Phycocyanin is a pigment unique to cyanobacteria; in-situ fluorescence (RFU) tracks blue-green algae biomass at the sonde in near real time,
                complementing the satellite view of the whole lough.
              </p>
            )}
          </section>
        )}
      </div>
    </calcite-panel>
  );
}

import { useEffect, useState } from "react";
import { fmtDate } from "./charts.jsx";
import { bgaReportsThisYear, loughStatus } from "../lib/daera.js";
import { compass, weatherLabel } from "../lib/weather.js";

const LEVEL = {
  low: { label: "Low", kind: "success", icon: "check-circle" },
  moderate: { label: "Moderate", kind: "warning", icon: "exclamation-mark-triangle" },
  high: { label: "High", kind: "danger", icon: "exclamation-mark-circle" },
};

const STATUS_TEXT = { PEP: "Poor ecological potential", POOR: "Poor", MODERATE: "Moderate", MEP: "Moderate ecological potential", GOOD: "Good", BAD: "Bad" };

function Stat({ label, value, sub }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}

export function OverviewPanel({ conditions, weather, lakeReadings, latestScene, onShowScene, onShowLayer, onClose }) {
  const [bga, setBga] = useState(null);
  const [status, setStatus] = useState([]);

  useEffect(() => {
    const ac = new AbortController();
    bgaReportsThisYear(ac.signal).then(setBga).catch(() => {});
    loughStatus(ac.signal).then(setStatus).catch(() => {});
    return () => ac.abort();
  }, []);

  const level = conditions && LEVEL[conditions.level];
  const cur = weather?.current;
  const today = new Date().toISOString().slice(0, 10);
  const forecast = weather?.daily.filter((d) => d.date >= today).slice(0, 7) ?? [];

  return (
    <calcite-panel heading="Lough Neagh today" description="Ireland's largest lake · ≈390 km² · supplies ~40% of NI's drinking water" closable oncalcitePanelClose={onClose}>
      <div className="panel-body">
        <section className="hero">
          <span className="stat-label">Bloom conditions index</span>
          {conditions ? (
            <>
              <div className="hero-row">
                <span className="hero-value">{level.label}</span>
                <calcite-chip kind={level.kind === "danger" ? "brand" : "neutral"} icon={level.icon} scale="s" appearance="outline-fill">
                  {conditions.score} / {conditions.max}
                </calcite-chip>
              </div>
              <calcite-meter
                min="0"
                max={conditions.max}
                value={conditions.score}
                low={Math.round(conditions.max * 0.3)}
                high={Math.round(conditions.max * 0.6)}
                fill-type="range"
                label="Bloom conditions index"
                scale="s"
              />
              <ul className="factor-list">
                {conditions.factors.map((f) => (
                  <li key={f.label}>
                    <span>
                      {f.label}: <strong>{f.value}</strong>
                    </span>
                    <span className="muted">
                      +{f.pts}/{f.max}
                    </span>
                    <span className="muted small">{f.note}</span>
                  </li>
                ))}
              </ul>
              <p className="muted small">
                A transparent heuristic from live DAERA sonde readings and the Open-Meteo forecast. It is not an official warning. Check DAERA's
                blue-green algae reports before contact with the water.
              </p>
            </>
          ) : (
            <calcite-loader inline label="Loading live conditions" />
          )}
        </section>

        <section>
          <h3>Live readings</h3>
          <div className="stat-grid">
            <Stat label="Lough water temp" value={lakeReadings?.temp != null ? `${lakeReadings.temp.toFixed(1)} °C` : "—"} sub="mean of in-lough sondes" />
            <Stat label="Phycocyanin (max)" value={lakeReadings?.pc != null ? `${lakeReadings.pc.toFixed(2)} RFU` : "—"} sub={lakeReadings?.pcAt ?? ""} />
            <Stat label="Air temperature" value={cur ? `${cur.temperature_2m.toFixed(1)} °C` : "—"} sub={cur ? weatherLabel(cur.weather_code) : ""} />
            <Stat label="Wind" value={cur ? `${cur.wind_speed_10m.toFixed(1)} m/s` : "—"} sub={cur ? `from ${compass(cur.wind_direction_10m)}` : ""} />
          </div>
          {lakeReadings?.at && <p className="muted small">Sonde readings as of {fmtDate(lakeReadings.at)}.</p>}
        </section>

        {forecast.length > 0 && (
          <section>
            <h3>7-day outlook over the lough</h3>
            <table className="forecast">
              <thead>
                <tr>
                  <th scope="col">Day</th>
                  <th scope="col">Max °C</th>
                  <th scope="col">Wind m/s</th>
                  <th scope="col">Sun MJ/m²</th>
                </tr>
              </thead>
              <tbody>
                {forecast.map((d) => (
                  <tr key={d.date}>
                    <td>{new Date(d.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric" })}</td>
                    <td>{d.tmax.toFixed(0)}</td>
                    <td>{d.wind.toFixed(1)}</td>
                    <td>{d.sun.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section>
          <h3>Status & reports</h3>
          {latestScene && (
            <div className="list-row">
              <div>
                <strong>Latest clear satellite view</strong>
                <span className="muted small">
                  {fmtDate(Date.parse(latestScene.date))}: {Math.round(latestScene.bloom * 100)}% of lough at bloom level
                </span>
              </div>
              <calcite-button scale="s" appearance="outline" icon-start="satellite-3" onClick={() => onShowScene(latestScene.id)}>
                Show
              </calcite-button>
            </div>
          )}
          {bga && (
            <div className="list-row">
              <div>
                <strong>
                  {bga.count} blue-green algae sites reported in {bga.year}
                </strong>
                <span className="muted small">Lough Neagh & Bann catchments ({bga.total} sites on record)</span>
              </div>
              <calcite-button scale="s" appearance="outline" icon-start="pin" onClick={() => onShowLayer("bga")}>
                Map
              </calcite-button>
            </div>
          )}
          {status.map((s) => (
            <div className="list-row" key={s.namespace}>
              <div>
                <strong>{s.namespace}</strong>
                <span className="muted small">WFD 2018 classification: {STATUS_TEXT[s.F2018_statu] ?? s.F2018_statu}</span>
              </div>
              <calcite-button scale="s" appearance="outline" icon-start="layers" onClick={() => onShowLayer("wfdStatus")}>
                Map
              </calcite-button>
            </div>
          ))}
        </section>
      </div>
    </calcite-panel>
  );
}

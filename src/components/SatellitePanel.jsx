import { useMemo, useState } from "react";
import { BloomTimeline, YearColumns, fmtDate } from "./charts.jsx";
import { MODES } from "../hooks/useSentinel.js";
import { BLOOM_THRESHOLD, INDICES, indexClasses, ndciToChl } from "../lib/sentinel.js";

const CLEAR_OPTIONS = [0.3, 0.5, 0.7];
const SERIES = "var(--series-3)";

function ClassLegend({ mode }) {
  if (mode === "truecolor" || mode === "off") return null;
  const idx = INDICES[mode];
  return (
    <div className="class-legend" aria-label={`${idx.label} legend`}>
      {indexClasses(mode).map((c) => (
        <div key={c.label} className="class-legend-row">
          <i style={{ background: `rgba(${c.color.slice(0, 3).join(",")},${c.color[3] / 255})` }} />
          <span>{c.label}</span>
          <span className="muted">
            {c.min.toFixed(2)}–{c.max.toFixed(2)}
            {mode === "ndci" && ` · ≈${Math.round(ndciToChl(c.min))}${c.max >= 0.4 ? "+" : `–${Math.round(ndciToChl(c.max))}`} µg/L`}
          </span>
        </div>
      ))}
      <p className="muted small">{idx.description}</p>
    </div>
  );
}

export function SatellitePanel({ sentinel, onClose }) {
  const { scenes, status, topup, mode, setMode, selected, selectScene, step, peakYear, setPeakYear, peakState } = sentinel;
  const [minClear, setMinClear] = useState(0.5);
  const [year, setYear] = useState("all");

  const filtered = useMemo(
    () => scenes.filter((s) => s.clear >= minClear && (year === "all" || s.date.startsWith(year))),
    [scenes, minClear, year],
  );

  // Mean bloom extent over the summer bloom season (Jun–Sep) for each year, clear scenes only.
  const yearly = useMemo(() => {
    const by = new Map();
    for (const s of scenes) {
      const m = Number(s.date.slice(5, 7));
      if (s.clear < minClear || m < 6 || m > 9) continue;
      const y = s.date.slice(0, 4);
      if (!by.has(y)) by.set(y, []);
      by.get(y).push(s);
    }
    return [...by.entries()].map(([y, list]) => {
      const peak = list.reduce((a, b) => (b.bloom > a.bloom ? b : a));
      return {
        year: y,
        value: list.reduce((a, s) => a + s.bloom, 0) / list.length,
        mean: list.reduce((a, s) => a + s.mean, 0) / list.length,
        n: list.length,
        peak,
      };
    });
  }, [scenes, minClear]);

  const years = useMemo(() => [...new Set(scenes.map((s) => s.date.slice(0, 4)))], [scenes]);

  return (
    <calcite-panel heading="Sentinel-2 algae analysis" description="Copernicus Sentinel-2 L2A, 10–20 m, 2018 – today" closable oncalcitePanelClose={onClose}>
      <div className="panel-body">
        {status === "error" && (
          <calcite-notice open kind="danger" icon="exclamation-mark-triangle">
            <div slot="message">Couldn't load the Sentinel-2 bloom history.</div>
          </calcite-notice>
        )}

        <section>
          <calcite-label layout="block">
            Map overlay
            <calcite-segmented-control width="full" scale="s" oncalciteSegmentedControlChange={(e) => setMode(e.target.value)}>
              {MODES.map((m) => (
                <calcite-segmented-control-item key={m.id} value={m.id} checked={mode === m.id && !peakState}>
                  {m.label}
                </calcite-segmented-control-item>
              ))}
            </calcite-segmented-control>
          </calcite-label>

          {peakState ? (
            <div className="scene-card">
              <div className="scene-card-head">
                <strong>Peak bloom composite, Jun–Sep {peakState.year}</strong>
                <calcite-button scale="s" appearance="outline" kind="neutral" onClick={() => setPeakYear(null)}>
                  Back to scenes
                </calcite-button>
              </div>
              <p className="muted small">
                Highest cloud-free NDCI seen at every pixel across all scenes of the season (≤60% tile cloud). Shows where blooms reached over the
                summer, not a single day. {peakState.loading && "Registering mosaic…"}
                {peakState.error && `Failed: ${peakState.error}`}
              </p>
            </div>
          ) : (
            selected && (
              <div className="scene-card">
                <div className="scene-card-head">
                  <calcite-button scale="s" appearance="transparent" kind="neutral" icon-start="chevron-left" label="Previous scene" onClick={() => step(-1, filtered)} />
                  <div className="scene-card-title">
                    <strong>{fmtDate(Date.parse(selected.date))}</strong>
                    <span className="muted small">
                      {selected.id.slice(0, 3)} · {Math.round(selected.clear * 100)}% of lough cloud-free{selected.live ? " · new" : ""}
                    </span>
                  </div>
                  <calcite-button scale="s" appearance="transparent" kind="neutral" icon-start="chevron-right" label="Next scene" onClick={() => step(1, filtered)} />
                </div>
                <div className="stat-row">
                  <div className="stat">
                    <span className="stat-label">Bloom extent</span>
                    <span className="stat-value">{Math.round(selected.bloom * 100)}%</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Mean NDCI</span>
                    <span className="stat-value">{selected.mean?.toFixed(3)}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">≈ Chl-a (p90)</span>
                    <span className="stat-value">{Math.round(ndciToChl(selected.p90))} µg/L</span>
                  </div>
                </div>
              </div>
            )
          )}
          <ClassLegend mode={peakState ? "ndci" : mode} />
        </section>

        <section>
          <h3>Bloom extent, every scene</h3>
          <p className="muted small">
            Share of the cloud-free lough with NDCI ≥ {BLOOM_THRESHOLD} (≈{Math.round(ndciToChl(BLOOM_THRESHOLD))} µg/L chlorophyll-a). Fainter dots had
            more cloud. Click a dot to put that scene on the map.
          </p>
          <div className="filter-row">
            <calcite-select scale="s" label="Year" oncalciteSelectChange={(e) => setYear(e.target.value)}>
              <calcite-option value="all" selected={year === "all"}>
                All years
              </calcite-option>
              {years.map((y) => (
                <calcite-option key={y} value={y} selected={year === y}>
                  {y}
                </calcite-option>
              ))}
            </calcite-select>
            <calcite-segmented-control scale="s" oncalciteSegmentedControlChange={(e) => setMinClear(Number(e.target.value))}>
              {CLEAR_OPTIONS.map((c) => (
                <calcite-segmented-control-item key={c} value={String(c)} checked={minClear === c}>
                  ≥{c * 100}% clear
                </calcite-segmented-control-item>
              ))}
            </calcite-segmented-control>
          </div>
          <BloomTimeline scenes={filtered} selectedId={peakState ? null : selected?.id} onSelect={selectScene} color={SERIES} />
          <p className="muted small">
            {filtered.length} scenes shown of {scenes.length}.{" "}
            {topup?.pending && `Analysing ${topup.pending} newer scene(s)…`}
            {topup?.added > 0 && `${topup.added} scene(s) since the last build analysed live.`}
          </p>
        </section>

        <section>
          <h3>Summer bloom extent by year</h3>
          <p className="muted small">Mean of the per-scene bloom extent over June–September. Click a year for its peak-bloom composite map.</p>
          {yearly.length > 0 && (
            <YearColumns
              rows={yearly}
              color={SERIES}
              selected={peakYear}
              format={(v) => `${Math.round(v * 100)}%`}
              detail={(r) => [
                [`${Math.round(r.value * 100)}%`, "mean bloom extent"],
                [r.mean.toFixed(3), "mean NDCI"],
                [String(r.n), "clear scenes"],
                [`${fmtDate(Date.parse(r.peak.date))}`, `peak (${Math.round(r.peak.bloom * 100)}%)`],
              ]}
              onSelect={(y) => setPeakYear((cur) => (cur === y ? null : y))}
            />
          )}
          <calcite-notice open kind="warning" scale="s" icon="information">
            <div slot="message">
              Comparisons across years are indicative. ESA's processing baseline changed in 2022 (handled here by removing the +1000 offset), and
              atmospheric correction over a turbid, hypertrophic lake carries uncertainty. NDCI→chlorophyll uses a global fit that hasn't been calibrated
              against AFBI/DAERA samples.
            </div>
          </calcite-notice>
        </section>
      </div>
    </calcite-panel>
  );
}

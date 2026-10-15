import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from "react";

// Small dependency-free SVG charts. Spec: 2px lines, ≥8px markers with a 2px surface ring, 10% area
// washes, hairline recessive grid, one y-axis, crosshair/per-mark tooltips, legend for ≥2 series.

function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(320);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(200, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

function niceTicks(min, max, count = 4) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? mag * 10;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v / step) * step);
  return ticks;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function timeTicks(t0, t1, maxTicks) {
  const days = (t1 - t0) / 864e5;
  const d0 = new Date(t0);
  const out = [];
  if (days > 900) {
    for (let y = d0.getUTCFullYear(); ; y++) {
      const t = Date.UTC(y, 0, 1);
      if (t > t1) break;
      if (t >= t0) out.push({ t, label: String(y) });
    }
    return out;
  }
  const stepMonths = days > 400 ? 3 : days > 150 ? 2 : days > 45 ? 1 : 0;
  if (stepMonths) {
    for (let m = d0.getUTCFullYear() * 12 + d0.getUTCMonth() + 1; ; m += stepMonths) {
      const t = Date.UTC(Math.floor(m / 12), m % 12, 1);
      if (t > t1) break;
      const mm = m % 12;
      out.push({ t, label: mm === 0 ? `${MONTHS[mm]} ${Math.floor(m / 12)}` : MONTHS[mm] });
    }
  } else {
    const step = Math.max(1, Math.ceil(days / maxTicks)) * 864e5;
    for (let t = Math.ceil(t0 / 864e5) * 864e5; t <= t1; t += step) {
      const d = new Date(t);
      out.push({ t, label: `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}` });
    }
  }
  return out.length > maxTicks ? out.filter((_, i) => i % Math.ceil(out.length / maxTicks) === 0) : out;
}

export const fmtDate = (t) => {
  const d = new Date(t);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

const fmt = (v, digits) => (Number.isFinite(v) ? v.toLocaleString("en-GB", { maximumFractionDigits: digits, minimumFractionDigits: digits }) : "—");

function Tooltip({ x, y, width, children }) {
  const left = Math.min(Math.max(8, x + 12), width - 180);
  return (
    <div className="viz-tooltip" style={{ left, top: Math.max(0, y - 10) }} role="status">
      {children}
    </div>
  );
}

function Legend({ series }) {
  if (series.length < 2) return null;
  return (
    <div className="viz-legend">
      {series.map((s) => (
        <span key={s.id}>
          <i style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

const M = { top: 10, right: 12, bottom: 22, left: 40 };

/** Daily time series. A single series also draws its daily min–max range as a 10% wash. */
export function TimeSeriesChart({ series, unit, digits = 1, height = 190, refLines = [] }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const clipId = `clip${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const all = series.flatMap((s) => s.points);
  const showBand = series.length === 1;

  const { x, y, yTicks, xTicks, t0, t1 } = useMemo(() => {
    const ts = all.map((p) => p.t);
    const t0 = Math.min(...ts);
    const t1 = Math.max(...ts);
    // Scale to the daily means (plus daily minima): single-reading spikes in the daily maxima —
    // common with fouled optical sensors — would otherwise flatten the line. The band is clipped.
    const vals = all.flatMap((p) => (showBand ? [p.lo ?? p.v, p.v] : [p.v])).filter(Number.isFinite);
    const sorted = all.map((p) => p.v).filter(Number.isFinite).sort((a, b) => a - b);
    if (showBand && sorted.length) vals.push(sorted[Math.floor(sorted.length * 0.98)] * 1.25);
    refLines.forEach((r) => vals.push(r.value));
    const yTicks = niceTicks(Math.min(0, ...vals) < 0 ? Math.min(...vals) : Math.min(...vals) * 0.95, Math.max(...vals));
    const iw = width - M.left - M.right;
    const ih = height - M.top - M.bottom;
    const x = (t) => M.left + (t1 === t0 ? iw / 2 : ((t - t0) / (t1 - t0)) * iw);
    const y = (v) => M.top + ih - ((v - yTicks[0]) / (yTicks.at(-1) - yTicks[0])) * ih;
    return { x, y, yTicks, xTicks: timeTicks(t0, t1, Math.max(2, Math.floor(iw / 70))), t0, t1 };
  }, [all, width, height, showBand, refLines]);

  const onMove = useCallback(
    (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const t = t0 + ((px - M.left) / (width - M.left - M.right)) * (t1 - t0);
      const rows = series
        .map((s) => {
          let best = null;
          for (const p of s.points) if (!best || Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
          return best && { s, p: best };
        })
        .filter(Boolean);
      if (!rows.length) return setHover(null);
      const nearest = rows.reduce((a, b) => (Math.abs(a.p.t - t) <= Math.abs(b.p.t - t) ? a : b));
      setHover({ t: nearest.p.t, rows: rows.filter((r) => Math.abs(r.p.t - nearest.p.t) < 864e5 * 1.5) });
    },
    [series, t0, t1, width],
  );

  if (!all.length) return <div className="viz-empty">No readings in this period.</div>;

  const path = (pts, key = "v") => {
    let d = "";
    let prev = null;
    for (const p of pts) {
      const gap = prev && p.t - prev.t > 3 * 864e5; // break the line across outages
      d += `${!prev || gap ? "M" : "L"}${x(p.t).toFixed(1)},${y(p[key]).toFixed(1)}`;
      prev = p;
    }
    return d;
  };
  const band = (pts) => {
    if (!pts.length) return "";
    const top = pts.map((p) => `${x(p.t).toFixed(1)},${y(p.hi ?? p.v).toFixed(1)}`);
    const bot = [...pts].reverse().map((p) => `${x(p.t).toFixed(1)},${y(p.lo ?? p.v).toFixed(1)}`);
    return `M${top.join("L")}L${bot.join("L")}Z`;
  };

  return (
    <div className="viz" ref={ref}>
      <Legend series={series} />
      <div style={{ position: "relative" }}>
        <svg width={width} height={height} onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={`${series.map((s) => s.label).join(", ")} daily values`}>
          {yTicks.map((v) => (
            <g key={v}>
              <line className="viz-grid" x1={M.left} x2={width - M.right} y1={y(v)} y2={y(v)} />
              <text className="viz-tick" x={M.left - 6} y={y(v)} dy="0.32em" textAnchor="end">
                {fmt(v, Math.abs(yTicks[1] - yTicks[0]) < 1 ? 1 : 0)}
              </text>
            </g>
          ))}
          {xTicks.map((tk) => (
            <text key={tk.t} className="viz-tick" x={x(tk.t)} y={height - 6} textAnchor="middle">
              {tk.label}
            </text>
          ))}
          {refLines.map((r) => (
            <g key={r.label}>
              <line className="viz-ref" x1={M.left} x2={width - M.right} y1={y(r.value)} y2={y(r.value)} />
              <text className="viz-tick" x={width - M.right} y={y(r.value) - 4} textAnchor="end">
                {r.label}
              </text>
            </g>
          ))}
          <defs>
            <clipPath id={clipId}>
              <rect x={M.left} y={M.top} width={width - M.left - M.right} height={height - M.top - M.bottom} />
            </clipPath>
          </defs>
          {showBand && <path d={band(series[0].points)} fill={series[0].color} opacity={0.12} clipPath={`url(#${clipId})`} />}
          {series.map((s) => (
            <path key={s.id} d={path(s.points)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" clipPath={`url(#${clipId})`} />
          ))}
          {hover && (
            <g>
              <line className="viz-crosshair" x1={x(hover.t)} x2={x(hover.t)} y1={M.top} y2={height - M.bottom} />
              {hover.rows.map(({ s, p }) => (
                <circle key={s.id} cx={x(p.t)} cy={y(p.v)} r={4} fill={s.color} className="viz-ring" />
              ))}
            </g>
          )}
        </svg>
        {hover && (
          <Tooltip x={x(hover.t)} y={M.top} width={width}>
            <div className="viz-tt-head">{fmtDate(hover.t)}</div>
            {hover.rows.map(({ s, p }) => (
              <div key={s.id} className="viz-tt-row">
                <i style={{ background: s.color }} />
                <strong>
                  {fmt(p.v, digits)} {unit}
                </strong>
                <span>{series.length > 1 ? s.label : showBand && Number.isFinite(p.hi) ? `range ${fmt(p.lo, digits)}–${fmt(p.hi, digits)}` : "daily mean"}</span>
              </div>
            ))}
          </Tooltip>
        )}
      </div>
    </div>
  );
}

/**
 * Every Sentinel-2 scene as a dot: x = date, y = share of the visible lough above the bloom
 * threshold. Nearest-point hover so small dots are easy to hit; click loads the scene on the map.
 */
export function BloomTimeline({ scenes, selectedId, onSelect, color, height = 200 }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const pts = useMemo(() => scenes.map((s) => ({ ...s, t: Date.parse(s.date) })), [scenes]);

  const geo = useMemo(() => {
    if (!pts.length) return null;
    const t0 = Date.UTC(new Date(pts[0].t).getUTCFullYear(), 0, 1);
    const t1 = Math.max(...pts.map((p) => p.t)) + 20 * 864e5;
    const iw = width - M.left - M.right;
    const ih = height - M.top - M.bottom;
    const x = (t) => M.left + ((t - t0) / (t1 - t0)) * iw;
    const y = (v) => M.top + ih - v * ih;
    return { x, y, xTicks: timeTicks(t0, t1, Math.floor(iw / 44)), t0, t1 };
  }, [pts, width, height]);

  const nearest = useCallback(
    (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      let best = null;
      let bestD = 24 * 24;
      for (const p of pts) {
        const dx = geo.x(p.t) - px;
        const dy = geo.y(p.bloom) - py;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      return best;
    },
    [pts, geo],
  );

  if (!geo) return <div className="viz-empty">No scenes match the filter.</div>;
  const sel = pts.find((p) => p.id === selectedId);

  return (
    <div className="viz" ref={ref}>
      <div style={{ position: "relative" }}>
        <svg
          width={width}
          height={height}
          style={{ cursor: hover ? "pointer" : "default" }}
          onPointerMove={(e) => setHover(nearest(e))}
          onPointerLeave={() => setHover(null)}
          onClick={(e) => {
            const p = nearest(e);
            if (p) onSelect(p.id);
          }}
          role="img"
          aria-label="Bloom extent per Sentinel-2 scene"
        >
          {[0, 0.25, 0.5, 0.75, 1].map((v) => (
            <g key={v}>
              <line className="viz-grid" x1={M.left} x2={width - M.right} y1={geo.y(v)} y2={geo.y(v)} />
              <text className="viz-tick" x={M.left - 6} y={geo.y(v)} dy="0.32em" textAnchor="end">
                {v * 100}%
              </text>
            </g>
          ))}
          {geo.xTicks.map((tk) => (
            <text key={tk.t} className="viz-tick" x={geo.x(tk.t)} y={height - 6} textAnchor="start">
              {tk.label}
            </text>
          ))}
          {pts.map((p) => (
            <circle key={p.id} cx={geo.x(p.t)} cy={geo.y(p.bloom)} r={hover?.id === p.id ? 5.5 : 4} fill={color} className="viz-ring" opacity={0.35 + 0.65 * p.clear} />
          ))}
          {sel && <circle cx={geo.x(sel.t)} cy={geo.y(sel.bloom)} r={7} fill="none" className="viz-selected" strokeWidth={2} />}
        </svg>
        {hover && (
          <Tooltip x={geo.x(hover.t)} y={geo.y(hover.bloom) - 40} width={width}>
            <div className="viz-tt-head">{fmtDate(hover.t)}</div>
            <div className="viz-tt-row">
              <strong>{Math.round(hover.bloom * 100)}%</strong>
              <span>of visible lough ≥ bloom threshold</span>
            </div>
            <div className="viz-tt-row">
              <strong>{fmt(hover.mean, 3)}</strong>
              <span>mean NDCI</span>
            </div>
            <div className="viz-tt-row">
              <strong>{Math.round(hover.clear * 100)}%</strong>
              <span>of lough cloud-free</span>
            </div>
            <div className="viz-tt-foot">Click to show this scene</div>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

/** Column per year; value label on the cap, hover tooltip carries the detail. */
export function YearColumns({ rows, color, format, detail, onSelect, selected, height = 150 }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const max = Math.max(...rows.map((r) => r.value), 1e-9);
  const iw = width - M.left - M.right + 28;
  const band = iw / Math.max(1, rows.length);
  const bw = Math.min(24, band * 0.6);
  const ih = height - 18 - M.bottom;
  const y = (v) => 18 + ih - (v / max) * ih;
  const left = M.left - 28;

  return (
    <div className="viz" ref={ref}>
      <div style={{ position: "relative" }}>
        <svg width={width} height={height} role="img" aria-label="Value per year">
          <line className="viz-axis" x1={left} x2={width - M.right} y1={y(0)} y2={y(0)} />
          {rows.map((r, i) => {
            const cx = left + band * i + band / 2;
            const h = y(0) - y(r.value);
            const rr = Math.min(4, h / 2);
            const x0 = cx - bw / 2;
            const top = y(r.value);
            const d = `M${x0},${y(0)}V${top + rr}Q${x0},${top} ${x0 + rr},${top}H${x0 + bw - rr}Q${x0 + bw},${top} ${x0 + bw},${top + rr}V${y(0)}Z`;
            const active = hover?.year === r.year || selected === r.year;
            return (
              <g
                key={r.year}
                onPointerEnter={() => setHover({ ...r, cx })}
                onPointerLeave={() => setHover(null)}
                onClick={() => onSelect?.(r.year)}
                style={{ cursor: onSelect ? "pointer" : "default" }}
                tabIndex={0}
                onFocus={() => setHover({ ...r, cx })}
                onBlur={() => setHover(null)}
                onKeyDown={(e) => e.key === "Enter" && onSelect?.(r.year)}
              >
                <rect x={cx - band / 2} y={0} width={band} height={height} fill="transparent" />
                <path d={d} fill={color} opacity={active ? 1 : 0.82} />
                {selected === r.year && <path d={d} fill="none" className="viz-selected" strokeWidth={1.5} />}
                <text className="viz-value" x={cx} y={top - 5} textAnchor="middle">
                  {format(r.value)}
                </text>
                <text className="viz-tick" x={cx} y={height - 6} textAnchor="middle">
                  {r.year}
                </text>
              </g>
            );
          })}
        </svg>
        {hover && (
          <Tooltip x={hover.cx} y={y(hover.value) - 30} width={width}>
            <div className="viz-tt-head">{hover.year}</div>
            {detail(hover).map(([v, l]) => (
              <div key={l} className="viz-tt-row">
                <strong>{v}</strong>
                <span>{l}</span>
              </div>
            ))}
          </Tooltip>
        )}
      </div>
    </div>
  );
}

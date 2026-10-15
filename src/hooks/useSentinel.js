import { useCallback, useEffect, useMemo, useState } from "react";
import {
  INDICES,
  itemTileTemplate,
  registerSeasonMosaic,
  sceneStatistics,
  searchScenes,
  seasonPeakTileTemplate,
} from "../lib/sentinel.js";

const BASE = import.meta.env.BASE_URL;
const LIVE_TOPUP_LIMIT = 12;

export const MODES = [
  { id: "ndci", label: "Chlorophyll" },
  { id: "scum", label: "Scum" },
  { id: "truecolor", label: "True colour" },
  { id: "off", label: "Off" },
];

/**
 * Sentinel-2 state: the precomputed per-scene lough statistics (public/data/bloom-history.json),
 * topped up live with any newer acquisitions, plus which scene / seasonal composite is on the map.
 * Pushes the chosen overlay into the scene through `setImagery`.
 */
export function useSentinel({ enabled, setImagery }) {
  const [scenes, setScenes] = useState([]);
  const [status, setStatus] = useState("loading");
  const [topup, setTopup] = useState(null);
  const [mode, setMode] = useState("ndci");
  const [selectedId, setSelectedId] = useState(null);
  const [peakYear, setPeakYear] = useState(null);
  const [peakState, setPeakState] = useState(null);

  // 1. Load the shipped history, then fetch statistics for anything newer.
  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const [hist, lough] = await Promise.all([
          fetch(`${BASE}data/bloom-history.json`, { signal: ac.signal }).then((r) => r.json()),
          fetch(`${BASE}data/lough-neagh.geojson`, { signal: ac.signal }).then((r) => r.json()),
        ]);
        let list = hist.scenes;
        setScenes(list);
        setStatus("ready");

        const last = list.at(-1)?.date ?? "2018-01-01";
        const today = new Date().toISOString().slice(0, 10);
        const known = new Set(list.map((s) => s.id));
        const fresh = (await searchScenes({ start: last, end: today, maxCloud: 85, signal: ac.signal }))
          .filter((it) => !known.has(it.id))
          .slice(0, LIVE_TOPUP_LIMIT);
        if (!fresh.length) return setTopup({ added: 0 });
        setTopup({ pending: fresh.length });
        const added = [];
        for (const item of fresh) {
          try {
            const st = await sceneStatistics(item, lough.features[0], { signal: ac.signal });
            added.push({ id: item.id, date: item.date, cloud: Math.round(item.cloud), baseline: item.baseline, ...st, live: true });
          } catch {
            /* skip scenes the tiler can't summarise */
          }
        }
        list = [...list, ...added].sort((a, b) => a.date.localeCompare(b.date));
        setScenes(list);
        setTopup({ added: added.length });
      } catch (err) {
        if (!ac.signal.aborted) {
          setStatus("error");
          console.error(err);
        }
      }
    })();
    return () => ac.abort();
  }, []);

  // Default to the most recent scene with a mostly clear view of the lough.
  useEffect(() => {
    if (selectedId || !scenes.length) return;
    const recent = [...scenes].reverse().find((s) => s.clear >= 0.6);
    if (recent) setSelectedId(recent.id);
  }, [scenes, selectedId]);

  const selected = useMemo(() => scenes.find((s) => s.id === selectedId) ?? null, [scenes, selectedId]);

  // 2. Seasonal peak composite: register a mosaic search for Jun–Sep of the chosen year.
  useEffect(() => {
    if (!peakYear) return setPeakState(null);
    const ac = new AbortController();
    setPeakState({ year: peakYear, loading: true });
    registerSeasonMosaic({ start: `${peakYear}-06-01`, end: `${peakYear}-09-30`, maxCloud: 60, signal: ac.signal })
      .then((searchId) => setPeakState({ year: peakYear, searchId }))
      .catch((err) => !ac.signal.aborted && setPeakState({ year: peakYear, error: err.message }));
    return () => ac.abort();
  }, [peakYear]);

  // 3. Push whichever overlay is active into the map.
  useEffect(() => {
    if (!enabled) return;
    if (peakState?.searchId) {
      setImagery(seasonPeakTileTemplate(peakState.searchId, peakState.year), { title: `Peak NDCI, Jun–Sep ${peakState.year}` });
    } else if (mode !== "off" && selected) {
      const label = mode === "truecolor" ? "True colour" : INDICES[mode].short;
      setImagery(itemTileTemplate(selected, mode), { title: `Sentinel-2 ${label}, ${selected.date}` });
    } else {
      setImagery(null);
    }
  }, [enabled, mode, selected, peakState, setImagery]);

  const selectScene = useCallback((id) => {
    setPeakYear(null);
    setSelectedId(id);
    setMode((m) => (m === "off" ? "ndci" : m));
  }, []);

  const step = useCallback(
    (dir, list) => {
      const i = list.findIndex((s) => s.id === selectedId);
      const next = list[Math.min(list.length - 1, Math.max(0, (i < 0 ? list.length : i) + dir))];
      if (next) selectScene(next.id);
    },
    [selectedId, selectScene],
  );

  return { scenes, status, topup, mode, setMode, selected, selectScene, step, peakYear, setPeakYear, peakState };
}

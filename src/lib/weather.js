// Open-Meteo (free, no key) conditions over the centre of the lough. Wind, sunshine and air
// temperature are the main short-term drivers of cyanobacterial scum formation: buoyant
// Microcystis colonies float to the surface and accumulate in calm, warm, sunny weather.

export const LOUGH_CENTRE = { lat: 54.6, lon: -6.45 };

export async function fetchWeather(signal) {
  const p = new URLSearchParams({
    latitude: LOUGH_CENTRE.lat,
    longitude: LOUGH_CENTRE.lon,
    current: "temperature_2m,wind_speed_10m,wind_direction_10m,cloud_cover,precipitation,weather_code,is_day,shortwave_radiation",
    daily: "temperature_2m_max,temperature_2m_min,wind_speed_10m_mean,shortwave_radiation_sum,precipitation_sum,weather_code",
    wind_speed_unit: "ms",
    timezone: "Europe/London",
    past_days: "14",
    forecast_days: "7",
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${p}`, { signal });
  if (!res.ok) throw new Error(`Open-Meteo request failed (${res.status})`);
  const json = await res.json();
  const d = json.daily;
  const daily = d.time.map((date, i) => ({
    date,
    tmax: d.temperature_2m_max[i],
    tmin: d.temperature_2m_min[i],
    wind: d.wind_speed_10m_mean[i],
    sun: d.shortwave_radiation_sum[i],
    rain: d.precipitation_sum[i],
    code: d.weather_code[i],
  }));
  return { current: json.current, daily };
}

// WMO weather code → SceneView environment.weather, so the 3D scene reflects the real sky.
export function sceneWeatherFor(current) {
  const c = current.weather_code;
  if ([45, 48].includes(c)) return { type: "foggy", fogStrength: 0.4 };
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return { type: "snowy", cloudCover: 0.9, precipitation: 0.4 };
  if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95) return { type: "rainy", cloudCover: 0.85, precipitation: Math.min(1, 0.2 + (current.precipitation ?? 0) / 4) };
  if (current.cloud_cover > 30) return { type: "cloudy", cloudCover: Math.min(1, current.cloud_cover / 100) };
  return { type: "sunny", cloudCover: Math.max(0, current.cloud_cover / 100) };
}

export function weatherLabel(code) {
  if (code === 0) return "Clear";
  if (code <= 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code >= 61 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Showers";
  if (code >= 95) return "Thunderstorm";
  return "—";
}

export function compass(deg) {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round((deg % 360) / 45) % 8];
}

/**
 * Indicative bloom-conditions index from in-lough probe readings plus the weather forecast.
 * A transparent heuristic, not a forecast model — every factor is surfaced in the UI.
 */
export function bloomConditions({ waterTemp, phycocyanin, weather }) {
  const factors = [];
  let score = 0;
  if (Number.isFinite(waterTemp)) {
    const pts = waterTemp >= 18 ? 2 : waterTemp >= 15 ? 1 : 0;
    score += pts;
    factors.push({ label: "Water temperature", value: `${waterTemp.toFixed(1)} °C`, pts, max: 2, note: "≥15 °C favours cyanobacterial growth; ≥18 °C strongly" });
  }
  if (Number.isFinite(phycocyanin)) {
    const pts = phycocyanin >= 4 ? 2 : phycocyanin >= 1.5 ? 1 : 0;
    score += pts;
    factors.push({ label: "Phycocyanin (probe max)", value: `${phycocyanin.toFixed(2)} RFU`, pts, max: 2, note: "Pigment specific to cyanobacteria, from DAERA in-lough sondes" });
  }
  const next3 = weather?.daily.filter((d) => d.date >= new Date().toISOString().slice(0, 10)).slice(0, 3) ?? [];
  if (next3.length) {
    const wind = next3.reduce((a, d) => a + d.wind, 0) / next3.length;
    const sun = next3.reduce((a, d) => a + d.sun, 0) / next3.length;
    const wPts = wind < 3 ? 2 : wind < 5 ? 1 : 0;
    const sPts = sun >= 15 ? 1 : 0;
    score += wPts + sPts;
    factors.push({ label: "Wind, next 3 days", value: `${wind.toFixed(1)} m/s`, pts: wPts, max: 2, note: "Calm water lets buoyant colonies rise and form surface scum" });
    factors.push({ label: "Sunshine, next 3 days", value: `${sun.toFixed(1)} MJ/m²/day`, pts: sPts, max: 1, note: "High irradiance drives photosynthesis and stratification" });
  }
  const max = factors.reduce((a, f) => a + f.max, 0) || 1;
  const ratio = score / max;
  const level = ratio >= 0.6 ? "high" : ratio >= 0.3 ? "moderate" : "low";
  return { score, max, level, factors };
}

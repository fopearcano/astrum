// Observing sites for the "tonight's sky" view.

export interface Place {
  name: string;
  lat: number;
  lon: number; // east positive
  tz: string;
}

export const PLACES: Place[] = [
  { name: 'London', lat: 51.507, lon: -0.128, tz: 'Europe/London' },
  { name: 'Paris', lat: 48.857, lon: 2.352, tz: 'Europe/Paris' },
  { name: 'Madrid', lat: 40.417, lon: -3.704, tz: 'Europe/Madrid' },
  { name: 'Rome', lat: 41.903, lon: 12.496, tz: 'Europe/Rome' },
  { name: 'Berlin', lat: 52.52, lon: 13.405, tz: 'Europe/Berlin' },
  { name: 'Stockholm', lat: 59.329, lon: 18.069, tz: 'Europe/Stockholm' },
  { name: 'Tromsø', lat: 69.649, lon: 18.956, tz: 'Europe/Oslo' },
  { name: 'Reykjavík', lat: 64.147, lon: -21.942, tz: 'Atlantic/Reykjavik' },
  { name: 'Moscow', lat: 55.756, lon: 37.617, tz: 'Europe/Moscow' },
  { name: 'Istanbul', lat: 41.008, lon: 28.978, tz: 'Europe/Istanbul' },
  { name: 'Cairo', lat: 30.044, lon: 31.236, tz: 'Africa/Cairo' },
  { name: 'Lagos', lat: 6.524, lon: 3.379, tz: 'Africa/Lagos' },
  { name: 'Nairobi', lat: -1.292, lon: 36.822, tz: 'Africa/Nairobi' },
  { name: 'Cape Town', lat: -33.925, lon: 18.424, tz: 'Africa/Johannesburg' },
  { name: 'Dubai', lat: 25.205, lon: 55.271, tz: 'Asia/Dubai' },
  { name: 'Mumbai', lat: 19.076, lon: 72.878, tz: 'Asia/Kolkata' },
  { name: 'Delhi', lat: 28.614, lon: 77.209, tz: 'Asia/Kolkata' },
  { name: 'Singapore', lat: 1.352, lon: 103.82, tz: 'Asia/Singapore' },
  { name: 'Jakarta', lat: -6.208, lon: 106.846, tz: 'Asia/Jakarta' },
  { name: 'Beijing', lat: 39.904, lon: 116.407, tz: 'Asia/Shanghai' },
  { name: 'Shanghai', lat: 31.23, lon: 121.474, tz: 'Asia/Shanghai' },
  { name: 'Seoul', lat: 37.567, lon: 126.978, tz: 'Asia/Seoul' },
  { name: 'Tokyo', lat: 35.676, lon: 139.65, tz: 'Asia/Tokyo' },
  { name: 'Sydney', lat: -33.869, lon: 151.209, tz: 'Australia/Sydney' },
  { name: 'Auckland', lat: -36.848, lon: 174.763, tz: 'Pacific/Auckland' },
  { name: 'Honolulu', lat: 21.307, lon: -157.858, tz: 'Pacific/Honolulu' },
  { name: 'Anchorage', lat: 61.218, lon: -149.9, tz: 'America/Anchorage' },
  { name: 'Los Angeles', lat: 34.052, lon: -118.244, tz: 'America/Los_Angeles' },
  { name: 'Chicago', lat: 41.878, lon: -87.63, tz: 'America/Chicago' },
  { name: 'New York', lat: 40.713, lon: -74.006, tz: 'America/New_York' },
  { name: 'Mexico City', lat: 19.433, lon: -99.133, tz: 'America/Mexico_City' },
  { name: 'Bogotá', lat: 4.711, lon: -74.072, tz: 'America/Bogota' },
  { name: 'Lima', lat: -12.046, lon: -77.043, tz: 'America/Lima' },
  { name: 'São Paulo', lat: -23.551, lon: -46.633, tz: 'America/Sao_Paulo' },
  { name: 'Buenos Aires', lat: -34.604, lon: -58.382, tz: 'America/Argentina/Buenos_Aires' },
  { name: 'Mauna Kea Observatories', lat: 19.821, lon: -155.468, tz: 'Pacific/Honolulu' },
  { name: 'Paranal Observatory, Atacama', lat: -24.627, lon: -70.404, tz: 'America/Santiago' },
  { name: 'Roque de los Muchachos, La Palma', lat: 28.757, lon: -17.885, tz: 'Atlantic/Canary' },
  { name: 'McMurdo Station, Antarctica', lat: -77.846, lon: 166.676, tz: 'Antarctica/McMurdo' },
  { name: 'North Pole', lat: 90, lon: 0, tz: 'UTC' },
  { name: 'Equator, 0° longitude', lat: 0, lon: 0, tz: 'UTC' },
];

/** Offset of a time zone from UTC in minutes at the given instant. */
export function tzOffsetMinutes(tz: string, at: Date): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(at);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
    return Math.round((asUTC - at.getTime()) / 60000);
  } catch {
    return 0;
  }
}

export function formatLocal(tz: string, at: Date): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'short' }).format(at);
  } catch {
    return at.toUTCString();
  }
}

/** Picks a default site from the browser's time zone, falling back to London. */
export function defaultPlace(): Place {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const hit = PLACES.find((p) => p.tz === tz && p.tz !== 'UTC');
    if (hit) return hit;
  } catch {
    /* ignore */
  }
  return PLACES[0];
}

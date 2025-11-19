import { print } from './utils.js';
import { addMarker } from './markersDb.js';

// Proxy to bypass CORS restrictions of hamnetdb.net
const PROXY = 'https://r.jina.ai/https://';

const HAMNET_SITES = [
  'db0csh',
  'db0dtm',
  'db0diz',
  'db0hei',
  'db0hbo',
  'db0mue',
  'db0oha',
  'db0pra',
  'db0vc',
  'db0vel',
  'db0xh',
  'db0xn',
  'db0zod',
  'dm0fl',
  'dm0hro',
  'dm0kil',
  'dm0sl',
  'do0atr'
];

function extractCoords(html) {
  let m = html.match(/ma_lat=([0-9.]+)&ma_lon=([0-9.]+)/i);
  if (m) {
    return { lat: parseFloat(m[1]), lon: parseFloat(m[2]) };
  }
  m = html.match(/Coordinates:\s*([0-9.]+),\s*([0-9.]+)/i);
  if (m) {
    return { lat: parseFloat(m[1]), lon: parseFloat(m[2]) };
  }
  return null;
}

async function fetchSite(site) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 8000);
  try {
    const url = `${PROXY}hamnetdb.net/?q=${encodeURIComponent(site)}`;
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) return null;
    const text = await resp.text();
    const coords = extractCoords(text);
    return coords ? { ...coords, callsign: site } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function fetchHamnetSites() {
  const results = await Promise.allSettled(HAMNET_SITES.map(s => fetchSite(s)));
  return results
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value);
}

export async function importHamnetMarkers() {
  print('🌐 Lade HamnetDB Marker …');
  try {
    const markers = await fetchHamnetSites();
    for (const m of markers) {
      try {
        await addMarker({
          lat: m.lat,
          lon: m.lon,
          description: `<a href="https://hamnetdb.net/?q=${encodeURIComponent(m.callsign)}" target="_blank">${m.callsign}</a>`
        });
      } catch (e) {
        console.error('Failed to save marker', e);
      }
    }
    print(`✅ ${markers.length} HamnetDB Marker importiert`);
  } catch (e) {
    console.error('HamnetDB import failed', e);
    print('❌ HamnetDB Marker konnten nicht geladen werden');
  }
}

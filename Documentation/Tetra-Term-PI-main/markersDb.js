import { getTimestamp } from './utils.js';

const API_BASE =
  (typeof location !== 'undefined' && location.protocol === 'file:'
    ? 'http://localhost:3000/api'
    : '/api') + '/markers';

export function initMarkersDb() {
  return Promise.resolve();
}

export async function addMarker({ lat, lon, description, height }) {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lon, height: height || 0, description: description || '', timestamp: getTimestamp() })
  });
  const data = await res.json().catch(() => ({}));
  notifyChange();
  return data.insertId || null;
}

export function updateMarker(id, data) {
  return fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...data })
  }).then(() => notifyChange());
}

export function deleteMarker(id) {
  return fetch(`${API_BASE}/${id}`, { method: 'DELETE' }).then(() => notifyChange());
}

export function getMarkers() {
  return fetch(API_BASE)
    .then(res => (res.ok ? res.json() : []))
    .catch(() => []);
}

function notifyChange() {
  if (typeof document !== 'undefined') {
    document.dispatchEvent(new CustomEvent('markersChange'));
  }
}

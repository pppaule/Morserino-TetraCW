const API_BASE =
  (typeof location !== 'undefined' && location.protocol === 'file:'
    ? 'http://localhost:3000/api'
    : '/api') + '/tracks';

export function initTracksDb() {
  return Promise.resolve();
}

export function saveTrack(id, points) {
  return fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, points })
  });
}

export function deleteTrackDb(id) {
  return fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
}

export function clearTracks() {
  return fetch(API_BASE, { method: 'DELETE' });
}

export function getTracks() {
  return fetch(API_BASE)
    .then(res => (res.ok ? res.json() : []))
    .catch(() => []);
}

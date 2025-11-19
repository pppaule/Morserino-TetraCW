import { addMarker as addMarkerDb, deleteMarker as deleteMarkerDb } from './markersDb.js';

export let map;
export const previewMaps = { 1: null, 2: null };
export const gpsHouseMarkers = { 1: null, 2: null };
export const gpsHouseMarkerPreview = { 1: null, 2: null };
export const gpsPositions = {};
export const houseLabels = { 1: '🏠 (__ISSI1__)', 2: '🏠 (__ISSI2__)' };
export const gpsMarkers = {};
export const gpsMarkersPreview = {};
let gpsCluster;
export const geofences = [];
export let routingControl;
let activeBaseLayer;
let offlineLayer;
let mapMenu;
let mapMenuLatLng;
let deleteMarkerTarget = null;
let distanceStart = null;
const measureLines = [];
let poiLayer;
let routeStart = null;
let routeEnd = null;
let topoStart = null;

export function setHouseLabel(label, device = 1) {
  houseLabels[device] = label || houseLabels[device];
  const marker = gpsHouseMarkers[device];
  if (marker) marker.bindPopup(houseLabels[device]);
  const preview = gpsHouseMarkerPreview[device];
  if (preview) preview.bindPopup(houseLabels[device]);
}

const houseIcon = L.icon({
  iconUrl: 'markers/house.png',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32]
});

const iconMap = {
  man: L.icon({ iconUrl: 'markers/man.png', iconSize: [22, 32], iconAnchor: [11, 32], popupAnchor: [0, -32] }),
  car: L.icon({ iconUrl: 'markers/car.png', iconSize: [22, 32], iconAnchor: [11, 32], popupAnchor: [0, -32] }),
  walkie: L.icon({ iconUrl: 'markers/walkie-talkie.png', iconSize: [22, 32], iconAnchor: [11, 32], popupAnchor: [0, -32] }),
  pin: L.icon({ iconUrl: 'markers/pin.png', iconSize: [22, 32], iconAnchor: [11, 32], popupAnchor: [0, -32] }),
  people: L.icon({ iconUrl: 'markers/people.png', iconSize: [22, 32], iconAnchor: [11, 32], popupAnchor: [0, -32] }),
  telecom: L.icon({ iconUrl: 'markers/telecommunication.png', iconSize: [22, 32], iconAnchor: [11, 32], popupAnchor: [0, -32] })
};

const mastIcons = {
  online: L.icon({ iconUrl: 'markers/mast-online.png', iconSize: [22, 32], iconAnchor: [11, 32], popupAnchor: [0, -32] }),
  offline: L.icon({ iconUrl: 'markers/mast-offline.png', iconSize: [22, 32], iconAnchor: [11, 32], popupAnchor: [0, -32] }),
  unknown: L.icon({ iconUrl: 'markers/mast-un.png', iconSize: [22, 32], iconAnchor: [11, 32], popupAnchor: [0, -32] })
};

export const issiIconTypes = {};

export function setIssiIconType(issi, type) {
  issiIconTypes[issi] = type in iconMap ? type : 'man';
}

function getIconForIssi(issi) {
  const type = issiIconTypes[issi] || 'man';
  return iconMap[type] || iconMap.man;
}

const pinIcon = L.icon({
  iconUrl: 'markers/pin.png',
  iconSize: [22, 32],
  iconAnchor: [11, 32],
  popupAnchor: [0, -32]
});

const favoriteIcon = pinIcon;
export const favoriteLists = {};

function persistFavorites() {
  if (typeof localStorage === 'undefined') return;
  const data = {};
  Object.entries(favoriteLists).forEach(([list, entries]) => {
    data[list] = Object.entries(entries).map(([id, f]) => ({
      id: Number(id),
      name: f.name,
      lat: f.lat,
      lon: f.lon
    }));
  });
  localStorage.setItem('favorites', JSON.stringify(data));
}

export function loadFavoritesFromStorage() {
  if (typeof localStorage === 'undefined') return;
  try {
    const data = JSON.parse(localStorage.getItem('favorites') || '{}');
    Object.keys(data).forEach(list => {
      data[list].forEach(f => addFavorite(f.id, f.lat, f.lon, f.name, list));
    });
  } catch (e) {}
}

export function addFavorite(id, lat, lon, name = 'Favorite', list = 'default') {
  if (!map) return;
  if (!favoriteLists[list]) favoriteLists[list] = {};
  const marker = L.marker([lat, lon], { icon: favoriteIcon }).addTo(map).bindPopup(name);
  favoriteLists[list][id] = { marker, lat, lon, name };
  persistFavorites();
}

export function removeFavorite(id, list = 'default') {
  const f = favoriteLists[list] && favoriteLists[list][id];
  if (f) {
    map.removeLayer(f.marker);
    delete favoriteLists[list][id];
    persistFavorites();
  }
}

export function getFavorites(list) {
  if (list) return favoriteLists[list] || {};
  return favoriteLists;
}

const customMarkers = [];

function persistCustomMarkers() {
  if (typeof localStorage === 'undefined') return;
  const data = customMarkers.map(m => ({ lat: m.lat, lon: m.lon, desc: m.desc, height: m.height || 0 }));
  localStorage.setItem('customMarkers', JSON.stringify(data));
}

function removeCustomMarker(target) {
  if (!map || !target) return;
  if (poiLayer) poiLayer.removeLayer(target.marker);
  const idx = customMarkers.indexOf(target);
  if (idx !== -1) customMarkers.splice(idx, 1);
  persistCustomMarkers();
}

function removeStaticMarker(id) {
  if (!map) return;
  const marker = staticMarkers[id];
  if (!marker) return;
  if (poiLayer) poiLayer.removeLayer(marker);
  else map.removeLayer(marker);
  delete staticMarkers[id];
  deleteMarkerDb(id).catch(() => {});
}

function markerAt(latlng) {
  if (!map) return null;
  let found = null;
  let min = Infinity;
  customMarkers.forEach(m => {
    const dist = map.distance(latlng, [m.lat, m.lon]);
    if (dist < 20 && dist < min) {
      min = dist;
      found = { type: 'custom', marker: m };
    }
  });
  Object.entries(staticMarkers).forEach(([id, marker]) => {
    const dist = map.distance(latlng, marker.getLatLng());
    if (dist < 20 && dist < min) {
      min = dist;
      found = { type: 'static', id: Number(id) };
    }
  });
  return found;
}

function getMarkerInfo(ref) {
  if (!ref) return null;
  if (ref.type === 'custom') {
    const m = ref.marker;
    if (m.height == null) {
      m.height = parseFloat(prompt('Höhe des Markers in m?') || '0');
      persistCustomMarkers();
    }
    return { lat: m.lat, lon: m.lon, height: m.height };
  }
  if (ref.type === 'static') {
    const m = staticMarkers[ref.id];
    if (!m) return null;
    if (m.height == null) {
      m.height = parseFloat(prompt('Höhe des Markers in m?') || '0');
    }
    const ll = m.getLatLng();
    return { lat: ll.lat, lon: ll.lng, height: m.height };
  }
  return null;
}

export function addCustomMarker(lat, lon, desc = '', height = 0) {
  if (!map || !poiLayer) return null;
  const text = height ? `${desc}<br>Höhe: ${height} m` : desc;
  const marker = L.marker([lat, lon], { icon: pinIcon }).addTo(poiLayer).bindPopup(text);
  customMarkers.push({ lat, lon, desc, height, marker });
  persistCustomMarkers();
  return marker;
}

export function loadCustomMarkers() {
  if (typeof localStorage === 'undefined' || !poiLayer) return;
  try {
    const data = JSON.parse(localStorage.getItem('customMarkers') || '[]');
    data.forEach(m => addCustomMarker(m.lat, m.lon, m.desc, m.height || 0));
  } catch (e) {}
}

function clearMeasureLines() {
  if (!map) return;
  measureLines.forEach(l => map.removeLayer(l));
  measureLines.length = 0;
  distanceStart = null;
}

function clearRoute() {
  if (!map) return;
  if (routingControl) {
    map.removeControl(routingControl);
    routingControl = null;
  }
  routeStart = null;
  routeEnd = null;
}

async function calculateTopology(start, end) {
  if (!map) return;
  const steps = 20;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const lat = start.lat + (end.lat - start.lat) * (i / steps);
    const lon = start.lon + (end.lon - start.lon) * (i / steps);
    pts.push([lat, lon]);
  }
  let elevations = [];
  try {
    const locs = pts.map(p => p.join(',')).join('|');
    const data = await fetch(`https://api.opentopodata.org/v1/eudem25m?locations=${locs}`).then(r => r.json());
    elevations = (data.results || []).map(r => r.elevation || 0);
  } catch (e) {
    elevations = pts.map(() => 0);
  }
  const startElev = elevations[0] + start.height;
  const endElev = elevations[elevations.length - 1] + end.height;
  let los = true;
  for (let i = 1; i < elevations.length - 1; i++) {
    const frac = i / steps;
    const lineHeight = startElev + (endElev - startElev) * frac;
    if (elevations[i] > lineHeight) { los = false; break; }
  }
  const distance = map.distance([start.lat, start.lon], [end.lat, end.lon]);
  const fspl = 32.44 + 20 * Math.log10(distance / 1000) + 20 * Math.log10(430);
  const color = los ? 'green' : 'red';
  const line = L.polyline([[start.lat, start.lon], [end.lat, end.lon]], { color })
    .addTo(map)
    .bindPopup(`Distanz: ${(distance / 1000).toFixed(2)} km<br>FSPL: ${fspl.toFixed(1)} dB<br>Sichtverbindung: ${los ? 'ja' : 'nein'}`)
    .openPopup();
  measureLines.push(line);
  if (typeof document !== 'undefined') {
    document.dispatchEvent(new CustomEvent('topologyCalculated', { detail: { start, end, elevations, distance, fspl, los } }));
  }
}

export function initMap() {
  map = L.map("map").setView([51, 10], 7);
  offlineLayer = L.tileLayer("tiles/{z}/{x}/{y}.png", { attribution: "Offline", maxZoom: 19 });
  const baseLayers = {
    OpenStreetMap: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap"
    }),
    Topo: L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenTopoMap"
    }),
    Satellite: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      attribution: "© Esri"
    }),
    CyclOSM: L.tileLayer("https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png", {
      attribution: "© CyclOSM"
    }),
    Offline: offlineLayer
  };
  activeBaseLayer = baseLayers.OpenStreetMap.addTo(map);

  gpsCluster = L.markerClusterGroup();
  poiLayer = L.layerGroup();
  const overlays = {
    'GPS-Geräte': gpsCluster,
    'POIs': poiLayer
  };
  map.addLayer(gpsCluster);
  map.addLayer(poiLayer);
  L.control.layers(baseLayers, overlays).addTo(map);

  const prevEl1 = document.getElementById("mapPreview");
  if (prevEl1) {
    previewMaps[1] = L.map(prevEl1, {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false
    }).setView([51, 10], 7);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(previewMaps[1]);
  }
  const prevEl2 = document.getElementById("mapPreview2");
  if (prevEl2) {
    previewMaps[2] = L.map(prevEl2, {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false
    }).setView([51, 10], 7);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(previewMaps[2]);
  }
  loadCustomMarkers();
  setupMapMenu();
}

function setupMapMenu() {
  mapMenu = document.getElementById('mapMenu');
  if (!map || !mapMenu) return;
  const addMarkerEl = document.getElementById('mapMenuAddMarker');
  const measureEl = document.getElementById('mapMenuMeasure');
  const topoStartEl = document.getElementById('mapMenuTopoStart');
  const topoEndEl = document.getElementById('mapMenuTopoEnd');
  const routeStartEl = document.getElementById('mapMenuRouteStart');
  const routeEndEl = document.getElementById('mapMenuRouteEnd');
  const deleteMarkerEl = document.getElementById('mapMenuDeleteMarker');
  const clearMeasureEl = document.getElementById('mapMenuClearMeasure');
  const routeDeleteEl = document.getElementById('mapMenuRouteDelete');
  map.on('contextmenu', e => {
    mapMenuLatLng = e.latlng;
    deleteMarkerTarget = markerAt(mapMenuLatLng);
    mapMenu.style.left = e.originalEvent.pageX + 'px';
    mapMenu.style.top = e.originalEvent.pageY + 'px';
    mapMenu.style.display = 'block';
    if (deleteMarkerEl) deleteMarkerEl.classList.toggle('disabled', !deleteMarkerTarget);
    if (clearMeasureEl) clearMeasureEl.style.display = measureLines.length ? 'block' : 'none';
    if (routeDeleteEl) routeDeleteEl.style.display = routingControl ? 'block' : 'none';
    e.originalEvent.preventDefault();
  });
  map.on('click', hideMapMenu);
  document.addEventListener('click', hideMapMenu);
  if (addMarkerEl) addMarkerEl.onclick = async () => {
    const desc = prompt('Beschreibung für Marker?') || '';
    const height = parseFloat(prompt('Höhe des Markers in m?') || '0');
    const id = await addMarkerDb({ lat: mapMenuLatLng.lat, lon: mapMenuLatLng.lng, description: desc, height });
    if (id !== null) {
      addStaticMarker({ id, lat: mapMenuLatLng.lat, lon: mapMenuLatLng.lng, description: desc, height });
    }
    hideMapMenu();
  };
  if (measureEl) measureEl.onclick = () => {
    if (distanceStart) {
      const dist = map.distance(distanceStart, mapMenuLatLng);
      const line = L.polyline([distanceStart, mapMenuLatLng], { color: 'red' })
        .addTo(map)
        .bindPopup(dist >= 1000 ? (dist / 1000).toFixed(2) + ' km' : dist.toFixed(0) + ' m')
        .openPopup();
      measureLines.push(line);
      distanceStart = null;
    } else {
      distanceStart = mapMenuLatLng;
    }
    hideMapMenu();
  };
  if (deleteMarkerEl) deleteMarkerEl.onclick = () => {
    if (deleteMarkerTarget) {
      if (deleteMarkerTarget.type === 'custom') removeCustomMarker(deleteMarkerTarget.marker);
      else if (deleteMarkerTarget.type === 'static') removeStaticMarker(deleteMarkerTarget.id);
    }
    deleteMarkerTarget = null;
    hideMapMenu();
  };
  if (clearMeasureEl) clearMeasureEl.onclick = () => {
    clearMeasureLines();
    hideMapMenu();
  };
  if (topoStartEl) topoStartEl.onclick = () => {
    const m = markerAt(mapMenuLatLng);
    const info = getMarkerInfo(m);
    if (info) topoStart = info;
    hideMapMenu();
  };
  if (topoEndEl) topoEndEl.onclick = async () => {
    const m = markerAt(mapMenuLatLng);
    const info = getMarkerInfo(m);
    if (info && topoStart) {
      await calculateTopology(topoStart, info);
      topoStart = null;
    }
    hideMapMenu();
  };
  if (routeStartEl) routeStartEl.onclick = () => {
    routeStart = [mapMenuLatLng.lat, mapMenuLatLng.lng];
    if (routeEnd) calculateRoute(routeStart, routeEnd);
    hideMapMenu();
  };
  if (routeEndEl) routeEndEl.onclick = () => {
    routeEnd = [mapMenuLatLng.lat, mapMenuLatLng.lng];
    if (routeStart) calculateRoute(routeStart, routeEnd);
    hideMapMenu();
  };
  if (routeDeleteEl) routeDeleteEl.onclick = () => {
    clearRoute();
    hideMapMenu();
  };
}

function hideMapMenu() {
  if (mapMenu) mapMenu.style.display = 'none';
}

export function enableOfflineMode() {
  if (!map || !offlineLayer) return;
  if (activeBaseLayer) map.removeLayer(activeBaseLayer);
  offlineLayer.addTo(map);
  activeBaseLayer = offlineLayer;
}

export function cacheCurrentTiles() {
  if (!map || !activeBaseLayer) return;
  const bounds = map.getBounds();
  const zoom = map.getZoom();
  const tileLayer = activeBaseLayer;
  const tileSize = tileLayer.getTileSize();
  const nw = map.project(bounds.getNorthWest(), zoom).divideBy(tileSize.x).floor();
  const se = map.project(bounds.getSouthEast(), zoom).divideBy(tileSize.x).floor();
  for (let x = nw.x; x <= se.x; x++) {
    for (let y = nw.y; y <= se.y; y++) {
      const url = tileLayer.getTileUrl({ x, y, z: zoom });
      fetch(url).catch(() => {});
    }
  }
}

export function updateHousePosition(lat, lon, device = 1) {
  const label = houseLabels[device];
  if (gpsHouseMarkers[device]) {
    gpsHouseMarkers[device].setLatLng([lat, lon]);
  } else {
    gpsHouseMarkers[device] = L.marker([lat, lon], { icon: houseIcon })
      .addTo(map)
      .bindPopup(label);
  }
  gpsHouseMarkers[device].openPopup();
  map.setView([lat, lon], 14);

  const pm = previewMaps[device];
  if (pm) {
    if (gpsHouseMarkerPreview[device]) {
      gpsHouseMarkerPreview[device].setLatLng([lat, lon]);
    } else {
      gpsHouseMarkerPreview[device] = L.marker([lat, lon], { icon: houseIcon })
        .addTo(pm)
        .bindPopup(label);
    }
    gpsHouseMarkerPreview[device].openPopup();
    pm.setView([lat, lon], 14);
  }
}

export function updateMap() {
  const configs = [[gpsCluster, gpsMarkers]];
  Object.keys(previewMaps).forEach(dev => {
    const pm = previewMaps[dev];
    if (!gpsMarkersPreview[dev]) gpsMarkersPreview[dev] = {};
    configs.push([pm, gpsMarkersPreview[dev]]);
  });
  configs.forEach(([layer, markerSet]) => {
    if (!layer) return;

    // Remove markers that are no longer present
    Object.keys(markerSet).forEach(id => {
      if (!gpsPositions[id]) {
        layer.removeLayer(markerSet[id]);
        delete markerSet[id];
      }
    });

    // Update existing markers or add new ones
    Object.entries(gpsPositions).forEach(([issi, { lat, lon }]) => {
      const icon = getIconForIssi(issi);
      const marker = markerSet[issi];
      if (marker) {
        marker.setLatLng([lat, lon]).setIcon(icon).openPopup();
      } else {
        const m = L.marker([lat, lon], { icon })
          .bindPopup(`📡 ISSI: ${issi}<br>Lat: ${lat}<br>Lon: ${lon}`)
          .openPopup();
        markerSet[issi] = m;
        layer.addLayer(m);
      }
    });
  });
  checkGeofences();
}

export function addGeofence(lat, lon, radius, options = {}) {
  if (!map) return null;
  const circle = L.circle([lat, lon], { radius, color: 'blue', ...options }).addTo(map);
  geofences.push({ circle, inside: new Set() });
  return circle;
}

export function checkGeofences() {
  if (!map) return;
  geofences.forEach(g => {
    Object.entries(gpsPositions).forEach(([issi, { lat, lon }]) => {
      const center = g.circle.getLatLng();
      const dist = map.distance(center, [lat, lon]);
      const inside = dist <= g.circle.getRadius();
      const wasInside = g.inside.has(issi);
      if (inside && !wasInside) {
        g.inside.add(issi);
        if (typeof document !== 'undefined') {
          document.dispatchEvent(new CustomEvent('geofenceEnter', { detail: { issi, geofence: g.circle } }));
        }
      } else if (!inside && wasInside) {
        g.inside.delete(issi);
        if (typeof document !== 'undefined') {
          document.dispatchEvent(new CustomEvent('geofenceExit', { detail: { issi, geofence: g.circle } }));
        }
      }
    });
  });
}

export function calculateRoute(start, end) {
  if (!map || !L.Routing || !Array.isArray(start) || !Array.isArray(end)) return;
  if (routingControl) {
    map.removeControl(routingControl);
    routingControl = null;
  }
  routingControl = L.Routing.control({
    waypoints: [L.latLng(start[0], start[1]), L.latLng(end[0], end[1])],
    routeWhileDragging: false,
    language: 'de',
    router: L.Routing.osrmv1({ language: 'de' })
  }).addTo(map);
}

export function addRemoteMarkers(list) {
  if (!map || !Array.isArray(list)) return;
  list.forEach(item => {
    const loc = item.location;
    if (!Array.isArray(loc) || loc.length !== 2) return;
    const iconUrl = item.state === 'online' ? 'marker_online.png' : 'marker_offline.png';
    const icon = L.icon({ iconUrl, iconSize: [22, 32], iconAnchor: [11, 32], popupAnchor: [0, -32] });
    const popup = `<h6>${item.callsign || ''}</h6><table>` +
      `<tr><td><b>Sysop</b></td><td>${item.sysop || ''}</td></tr>` +
      `<tr><td><b>City</b></td><td>${item.city || ''}</td></tr>` +
      `<tr><td><b>Location Area</b></td><td>${item.area || ''}</td></tr>` +
      `<tr><td><b>Duplex Spacing</b></td><td>${item.spacing || ''}</td></tr>` +
      `<tr><td><b>Carrier</b></td><td>${item.carrier || ''}</td></tr>` +
      `<tr><td><b>State</b></td><td>${item.state || ''}</td></tr>` +
      `</table>`;
    L.marker(loc, { icon }).addTo(map).bindPopup(popup);
  });
}

export const siteMarkers = {};

function getSiteName(desc) {
  const m = desc && desc.match(/>([^<]+)<\/a>/i);
  return m ? m[1].toLowerCase() : null;
}

export function loadSiteMarkers(list) {
  if (!map || !Array.isArray(list)) return;
  list.forEach(({ lat, lon, description }) => {
    const site = getSiteName(description);
    if (!site) return;
    if (siteMarkers[site]) {
      siteMarkers[site].setLatLng([lat, lon]).bindPopup(description || '');
    } else {
      siteMarkers[site] = L.marker([lat, lon], { icon: mastIcons.unknown })
        .addTo(map)
        .bindPopup(description || '');
    }
  });
}

export function updateSiteMarkers(statusList = []) {
  Object.keys(siteMarkers).forEach(site => {
    const entry = statusList.find(s => s.site === site);
    let icon = mastIcons.unknown;
    if (entry) {
      const state = (entry.state || '').toLowerCase();
      icon = state.includes('online') ? mastIcons.online : mastIcons.offline;
    }
    siteMarkers[site].setIcon(icon);
  });
}

export const staticMarkers = {};

export function addStaticMarker(marker) {
  if (!map) return;
  const { id, lat, lon, description, height = 0 } = marker;
  const isHamnet = description && description.includes('hamnetdb.net');
  const icon = isHamnet ? iconMap.telecom : pinIcon;
  const m = L.marker([lat, lon], { icon })
    .bindPopup(description || '');
  if (poiLayer) poiLayer.addLayer(m);
  else m.addTo(map);
  m.height = height;
  staticMarkers[id] = m;
}

export function loadMarkers(list) {
  if (!map) return;
  const ids = list.map(m => m.id);
  Object.keys(staticMarkers).forEach(id => {
    if (!ids.includes(Number(id))) {
      if (poiLayer) poiLayer.removeLayer(staticMarkers[id]);
      else map.removeLayer(staticMarkers[id]);
      delete staticMarkers[id];
    }
  });
  list.forEach(marker => {
    if (staticMarkers[marker.id]) {
      staticMarkers[marker.id]
        .setLatLng([marker.lat, marker.lon])
        .bindPopup(marker.description || '');
      staticMarkers[marker.id].height = marker.height || 0;
    } else {
      addStaticMarker(marker);
    }
  });
}

export function updateMarkerPopup(id, description) {
  const m = staticMarkers[id];
  if (m) m.bindPopup(description || '');
}

export function setupSearch(inputId = 'searchBox', resultsId = 'searchResults') {
  const input = document.getElementById(inputId);
  const list = document.getElementById(resultsId);
  if (!input || !list) return;
  let current = [];
  input.addEventListener('input', async () => {
    const q = input.value;
    if (q.length < 3) return;
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5`);
    const data = await res.json().catch(() => []);
    current = data;
    list.innerHTML = '';
    data.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.display_name;
      list.appendChild(opt);
    });
  });
  input.addEventListener('change', () => {
    const val = input.value;
    const match = current.find(i => i.display_name === val);
    if (match) {
      const lat = parseFloat(match.lat);
      const lon = parseFloat(match.lon);
      map.setView([lat, lon], 14);
      addCustomMarker(lat, lon, match.display_name, 0);
    }
  });
}

export function removeMarker(id) {
  const m = staticMarkers[id];
  if (m) {
    map.removeLayer(m);
    delete staticMarkers[id];
  }
}

export const trackPoints = {};
export const trackLines = {};
let currentTrackId = null;
let recording = false;

export function setCurrentTrack(id) {
  const num = parseInt(id, 10);
  currentTrackId = isNaN(num) ? null : num;
}

export function startTrackRecording(id = Date.now()) {
  recording = true;
  setCurrentTrack(id);
  if (!trackPoints[id]) trackPoints[id] = [];
  return id;
}

export function stopTrackRecording() {
  recording = false;
  setCurrentTrack(null);
}

export function recordTrackPoint(lat, lon) {
  if (recording && currentTrackId != null) addTrackPoint(currentTrackId, lat, lon);
}

export function addTrackPointForCurrent(lat, lon) {
  if (currentTrackId == null) return;
  addTrackPoint(currentTrackId, lat, lon);
}

export function addTrackPoint(id, lat, lon) {
  if (!map) return;
  if (!trackPoints[id]) trackPoints[id] = [];
  trackPoints[id].push([lat, lon]);
  if (trackLines[id]) {
    trackLines[id].setLatLngs(trackPoints[id]);
  } else {
    trackLines[id] = L.polyline(trackPoints[id], { color: 'red' }).addTo(map);
  }
  notifyTrackChange(id);
}

export function exportTrackToGPX(id = currentTrackId) {
  const pts = trackPoints[id] || [];
  if (!pts.length) return;
  let gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Tetra-Terminal">\n<trk>\n<trkseg>\n`;
  pts.forEach(([lat, lon]) => { gpx += `<trkpt lat="${lat}" lon="${lon}"></trkpt>\n`; });
  gpx += `</trkseg>\n</trk>\n</gpx>`;
  const blob = new Blob([gpx], { type: 'application/gpx+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `track-${id}.gpx`;
  a.click();
  URL.revokeObjectURL(url);
}

export function fetchElevationProfile(id = currentTrackId) {
  const pts = trackPoints[id] || [];
  if (!pts.length) return Promise.resolve([]);
  const locs = pts.map(p => p.join(',')).join('|');
  return fetch(`https://api.opentopodata.org/v1/eudem25m?locations=${locs}`)
    .then(r => r.json())
    .then(data => {
      const res = (data.results || []).map((r, i) => ({ lat: pts[i][0], lon: pts[i][1], elevation: r.elevation }));
      res.forEach((p, i) => {
        if (i === 0) { p.slope = 0; return; }
        const prev = res[i - 1];
        const dist = map.distance([prev.lat, prev.lon], [p.lat, p.lon]) || 0;
        const diff = p.elevation - prev.elevation;
        p.slope = dist ? diff / dist : 0;
      });
      if (typeof document !== 'undefined') {
        document.dispatchEvent(new CustomEvent('elevationProfile', { detail: { id, profile: res } }));
      }
      return res;
    })
    .catch(() => []);
}

export function clearTrack(id) {
  trackPoints[id] = [];
  if (trackLines[id]) {
    map.removeLayer(trackLines[id]);
    delete trackLines[id];
  }
  notifyTrackChange(id);
}

export function loadTrackLines(list) {
  if (!map || !Array.isArray(list)) return;
  list.forEach(t => {
    trackPoints[t.id] = t.points || [];
    if (trackPoints[t.id].length) {
      trackLines[t.id] = L.polyline(trackPoints[t.id], { color: 'red' }).addTo(map);
    }
  });
}

export function getTracksData() {
  return Object.entries(trackPoints).map(([id, points]) => ({ id: Number(id), points }));
}

export function exportTracks() {
  const data = getTracksData();
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tracks.json';
  a.click();
  URL.revokeObjectURL(url);
}

function notifyTrackChange(id) {
  if (typeof document !== 'undefined') {
    document.dispatchEvent(new CustomEvent('trackChange', {
      detail: { id, points: trackPoints[id] || [] }
    }));
  }
}

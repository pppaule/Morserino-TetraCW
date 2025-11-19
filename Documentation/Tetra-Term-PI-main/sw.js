const CACHE_NAME = 'tetra-cache-v1';
const ASSETS = [
  '/',
  'index.html',
  'libs/leaflet.js',
  'libs/leaflet.css',
  'libs/leaflet.markercluster.js',
  'libs/MarkerCluster.css',
  'libs/MarkerCluster.Default.css',
  'libs/MarkerCluster.png',
  'libs/MarkerCluster-2x.png',
  'libs/leaflet-routing-machine.js',
  'libs/leaflet-routing-machine.css',
  'libs/chart.js',
  'script.js',
  'map.js',
  'serial.js',
  'rssiChart.js',
  'sds.js',
  'commands.js',
  'gpsInterval.js',
  'rssiInterval.js',
  'tgDisplay.js',
  'contacts.js',
  'contactsViewer.js',
  'utils.js',
  'db.js',
  'markersDb.js',
  'tracksDb.js',
  'logViewer.js',
  'webParser.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.host.endsWith('.tile.openstreetmap.org')) {
    event.respondWith(
      caches.open('osm-tiles').then(cache =>
        cache.match(event.request).then(cached => {
          const fetchPromise = fetch(event.request)
            .then(resp => {
              cache.put(event.request, resp.clone());
              return resp;
            })
            .catch(() => cached);
          return cached || fetchPromise;
        })
      )
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then(resp => resp || fetch(event.request))
  );
});

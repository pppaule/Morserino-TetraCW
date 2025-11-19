let webLogs = [];
let statusList = [];
let qrvList = [];
const staticSites = [
  'sip-gateway',
  'svx-262',
  'svx-26200',
  'tetrapack',
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
import { getStatusEntries, getQrvUsers, getWebLogs } from './db.js';
import { updateSiteMarkers } from './map.js';

export function initWebParser() {
  loadFromDb();
  setInterval(loadFromDb, 10000);
}

async function loadFromDb() {
  const [status, qrv, logs] = await Promise.all([
    getStatusEntries(),
    getQrvUsers(),
    getWebLogs()
  ]);
  statusList = status.slice();
  qrvList = qrv.slice();
  webLogs = logs.slice();
  renderStatus(statusList);
  renderQrv(qrvList);
  renderLogs(webLogs);
}

function renderStatus(list) {
  const tbody = document.getElementById('webStatusBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  list.forEach(e => {
    const tr = document.createElement('tr');
    const tdSite = document.createElement('td');
    tdSite.textContent = e.site;
    const tdState = document.createElement('td');
    tdState.textContent = e.state;
    const tdGroups = document.createElement('td');
    tdGroups.textContent = e.groups;
    tr.append(tdSite, tdState, tdGroups);
    tbody.appendChild(tr);
  });
  statusList = list.slice();
  updateSiteDisplay(statusList);
}

function renderQrv(list) {
  const tbody = document.getElementById('webQrvBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  list.forEach(e => {
    const tr = document.createElement('tr');
    const tdIssi = document.createElement('td');
    tdIssi.textContent = e.issi;
    const tdCall = document.createElement('td');
    tdCall.textContent = e.callsign;
    const tdSite = document.createElement('td');
    tdSite.textContent = e.site;
    const tdGroups = document.createElement('td');
    tdGroups.textContent = e.groups;
    tr.append(tdIssi, tdCall, tdSite, tdGroups);
    tbody.appendChild(tr);
  });
  qrvList = list.slice();
  updateSiteDisplay(statusList);
}

function renderLogs(list) {
  const tbody = document.getElementById('webLoggingBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  const items = list.slice().sort((a, b) =>
    new Date(b.timestamp || 0) - new Date(a.timestamp || 0)
  );
  items.forEach(e => {
    const tr = document.createElement('tr');
    const tdSite = document.createElement('td');
    tdSite.textContent = e.site;
    const tdModule = document.createElement('td');
    tdModule.textContent = e.module;
    const tdMessage = document.createElement('td');
    tdMessage.textContent = e.message;
    const tdTimestamp = document.createElement('td');
    tdTimestamp.textContent = e.timestamp;
    tr.append(tdSite, tdModule, tdMessage, tdTimestamp);
    tbody.appendChild(tr);
  });
}

function updateSiteDisplay(list) {
  const container = document.getElementById('siteStatusDisplay');
  if (container) {
    // ensure all sites from the list exist as elements
    list.forEach(({ site }) => {
      let div = container.querySelector(`[data-site="${site}"]`);
      if (!div) {
        div = document.createElement('div');
        const cls = staticSites.includes(site) ? 'site-entry' : 'site-entry dynamic';
        div.className = cls;
        div.dataset.site = site;
        div.textContent = site;
        container.appendChild(div);
      }
    });

    // update status for all existing site entries
    container.querySelectorAll('.site-entry').forEach(div => {
      const site = div.dataset.site;
      const entry = list.find(e => e.site === site);
      const baseClass = staticSites.includes(site) ? 'site-entry' : 'site-entry dynamic';
      div.className = baseClass;
      if (entry) {
        const isOnline = entry.state && entry.state.toLowerCase().includes('online');
        div.classList.add(isOnline ? 'online' : 'offline');
        const users = qrvList
          .filter(u => u.site === site)
          .map(u => `${u.issi} ${u.callsign}`)
          .join('\n');
        if (users) div.title = users;
        else div.removeAttribute('title');
      } else {
        div.classList.add('unknown');
        div.removeAttribute('title');
      }
    });
  }
  updateSiteMarkers(list);
}

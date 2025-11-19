import { getTimestamp } from './utils.js';

export const API_BASE =
  typeof location !== 'undefined' && location.protocol === 'file:'
    ? 'http://localhost:3000/api'
    : '/api';

export function initDb() {
  return Promise.resolve();
}

const cache = {};

async function post(store, data) {
  await fetch(`${API_BASE}/${store}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(data),
    cache: 'no-store'
  });
  cache[store] = undefined;
  notifyChange();
}

async function del(store, id) {
  const url = id ? `${API_BASE}/${store}/${id}` : `${API_BASE}/${store}`;
  await fetch(url, {
    method: 'DELETE',
    headers: { 'Cache-Control': 'no-store' },
    cache: 'no-store'
  });
  cache[store] = undefined;
  notifyChange();
}

async function get(store) {
  try {
    const res = await fetch(`${API_BASE}/${store}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-store' }
    });
    if (res.status === 304) {
      // If no cache exists return empty array to avoid stale data
      return cache[store] || [];
    }
    if (!res.ok) {
      console.error(`HTTP ${res.status} fetching ${store}`);
      return cache[store] || [];
    }
    const data = await res.json();
    cache[store] = data;
    return data;
  } catch (e) {
    console.error(`Request failed for ${store}`, e);
    return cache[store] || [];
  }
}

export function logCommand(command) {
  return post('commands', { timestamp: getTimestamp(), command });
}

export function logSds(data) {
  return post('sds', { timestamp: getTimestamp(), ...data });
}

export function logGps(data) {
  return post('gps', { timestamp: getTimestamp(), ...data });
}

export function saveContacts(list) {
  return Array.isArray(list) ? post('contacts', list) : Promise.resolve();
}

async function upsertList(store, list, key) {
  const existing = await get(store);
  const desiredKeys = new Set(list.map(e => e[key]));
  await Promise.all(
    existing
      .filter(row => !desiredKeys.has(row[key]))
      .map(row => del(store, row.id))
  );
  return Promise.all(list.map(row => post(store, row)));
}

export function saveStatus(list) {
  return Array.isArray(list) ? upsertList('web_status', list, 'site') : Promise.resolve();
}

export function saveQrvUsers(list) {
  return Array.isArray(list) ? upsertList('web_qrv', list, 'issi') : Promise.resolve();
}

export async function saveWebLogs(list) {
  if (Array.isArray(list)) {
    await del('web_logs');
    return post('web_logs', list);
  }
  return Promise.resolve();
}

export function clearDb() {
  const stores = ['commands','sds','gps','contacts','web_status','web_qrv','web_logs','dapnet_messages'];
  return Promise.all(stores.map(s => del(s)));
}

export function deleteEntry(store, id) {
  return del(store, id);
}

export function clearStore(store) {
  return del(store);
}

export function getStoreEntries(store) {
  return get(store);
}

export async function getAllLogs() {
  const [cmds, sds, gps, dapnet] = await Promise.all([
    get('commands'),
    get('sds'),
    get('gps'),
    get('dapnet_messages')
  ]);
  const all = [
    ...cmds.map(e => ({ type: 'command', store: 'commands', ...e })),
    ...sds.map(e => ({ type: 'sds', store: 'sds', ...e })),
    ...gps.map(e => ({ type: 'gps', store: 'gps', ...e })),
    ...dapnet.map(e => ({ type: 'dapnet', store: 'dapnet_messages', ...e }))
  ];
  return all.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

export function getContacts() {
  return get('contacts');
}

export function getStatusEntries() {
  return get('web_status');
}

export function getQrvUsers() {
  return get('web_qrv');
}

export function getWebLogs() {
  return get('web_logs');
}

export async function exportDbJson() {
  const res = await fetch(`${API_BASE}/export/json`);
  const data = await res.json();
  return JSON.stringify(data, null, 2);
}

export async function importDbJson(json) {
  let data;
  try {
    data = JSON.parse(json);
  } catch (e) {
    console.error(e);
    return;
  }
  await fetch(`${API_BASE}/import/json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  notifyChange();
}

function notifyChange() {
  if (typeof document !== 'undefined') {
    document.dispatchEvent(new CustomEvent('dbChange'));
  }
}

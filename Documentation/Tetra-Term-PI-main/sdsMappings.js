import { API_BASE, getStoreEntries, deleteEntry } from './db.js';

let mappings = [];

export async function initSdsMappings() {
  try {
    mappings = await getStoreEntries('sds_mappings');
  } catch (e) {
    mappings = [];
  }
}

export function getSdsMappings() {
  return mappings;
}

export async function addSdsMapping(mapping) {
  await fetch(`${API_BASE}/sds_mappings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mapping)
  });
  await initSdsMappings();
}

export async function deleteSdsMapping(index) {
  const m = mappings[index];
  if (m && m.id != null) {
    await deleteEntry('sds_mappings', m.id);
  }
  await initSdsMappings();
}

export async function updateSdsMapping(index, mapping) {
  const m = mappings[index];
  if (!m) return;
  await fetch(`${API_BASE}/sds_mappings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: m.id, ...mapping })
  });
  await initSdsMappings();
}


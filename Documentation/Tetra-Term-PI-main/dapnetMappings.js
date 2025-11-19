import { API_BASE, getStoreEntries, deleteEntry } from './db.js';

let mappings = [];

export async function initDapnetMappings() {
  try {
    mappings = await getStoreEntries('dapnet_mappings');
  } catch (e) {
    mappings = [];
  }
}

export function getDapnetMappings() {
  return mappings;
}

export async function addDapnetMapping(mapping) {
  await fetch(`${API_BASE}/dapnet_mappings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mapping)
  });
  await initDapnetMappings();
}

export async function deleteDapnetMapping(index) {
  const m = mappings[index];
  if (m && m.id != null) {
    await deleteEntry('dapnet_mappings', m.id);
  }
  await initDapnetMappings();
}

export async function updateDapnetMapping(index, mapping) {
  const m = mappings[index];
  if (!m) return;
  await fetch(`${API_BASE}/dapnet_mappings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: m.id, ...mapping })
  });
  await initDapnetMappings();
}


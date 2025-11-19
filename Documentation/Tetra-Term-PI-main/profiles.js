import { API_BASE, getStoreEntries, deleteEntry } from './db.js';

let profiles = {};
let nameToId = {};

export async function initProfiles() {
  try {
    const rows = await getStoreEntries('at_profiles');
    profiles = {};
    nameToId = {};
    rows.forEach(r => {
      profiles[r.name] = r.commands || [];
      nameToId[r.name] = r.id;
    });
  } catch (e) {
    profiles = {};
    nameToId = {};
  }
}

export function getProfiles() {
  return profiles;
}

export async function saveProfile(name, commands) {
  const id = nameToId[name];
  await fetch(`${API_BASE}/at_profiles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, name, commands })
  });
  await initProfiles();
}

export async function deleteProfile(name) {
  const id = nameToId[name];
  if (id != null) {
    await deleteEntry('at_profiles', id);
  }
  await initProfiles();
}

export async function runProfile(name, sendCommand, device = 1) {
  const cmds = profiles[name] || [];
  for (const cmd of cmds) {
    try {
      await sendCommand(cmd, device);
    } catch (e) {
      // Fehler ignorieren und mit dem nächsten Befehl fortfahren
      console.warn('AT-Befehl fehlgeschlagen, wird ignoriert:', e);
    }
  }
}


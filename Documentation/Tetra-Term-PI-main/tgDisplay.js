export const talkGroups = [
  { id: '1', label: 'TG 1' },
  { id: '2', label: 'TG 2' },
  { id: '3', label: 'TG 3' },
  { id: '4', label: 'TG 4' },
  { id: '91102', label: 'TG Notfunk' },
  { id: '262', label: 'TG 262' },
  { id: '26200', label: 'TG 26200' }
];

let contacts = [];

export async function initTalkGroupDisplay(getContacts, device = 1) {
  const containerId = device === 1 ? 'tgDisplay' : `tgDisplay${device}`;
  const container = document.getElementById(containerId);
  if (!container) return;

  if (typeof getContacts === 'function' && contacts.length === 0) {
    try {
      contacts = await getContacts();
    } catch (e) { /* ignore */ }
  }

  talkGroups.forEach(tg => {
    const div = document.createElement('div');
    div.className = 'tg-entry';
    div.id = `tg-${device}-${tg.id}`;
    const label = document.createElement('span');
    label.className = 'tg-label';
    label.textContent = tg.label;
    const info = document.createElement('span');
    info.className = 'tg-info';
    div.appendChild(label);
    div.appendChild(info);
    container.appendChild(div);
  });
}

export function markGroupActive(tgId, issi, device = 1) {
  const el = document.getElementById(`tg-${device}-${tgId}`);
  if (!el) return;
  const infoSpan = el.querySelector('.tg-info');
  let name = '';
  if (Array.isArray(contacts) && issi) {
    const c = contacts.find(ct => ct.number === issi);
    if (c) name = c.name;
  }
  if (infoSpan) {
    infoSpan.textContent = issi ? ` ${issi}${name ? ' (' + name + ')' : ''}` : '';
  }
  el.classList.add('active');
  clearTimeout(el._tgTimer);
  el._tgTimer = setTimeout(() => el.classList.remove('active'), 5000);
}

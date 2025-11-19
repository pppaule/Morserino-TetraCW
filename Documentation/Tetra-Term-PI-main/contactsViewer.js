import { getContacts } from './db.js';

export let contacts = [];

export async function initContactsViewer() {
  await loadContacts();
  document.addEventListener('dbChange', loadContacts);
}

export async function loadContacts() {
  contacts = await getContacts();
  renderContacts();
}

function renderContacts() {
  const tbodies = document.querySelectorAll('.contactsTableBody');
  if (!tbodies.length) return;
  tbodies.forEach(tbody => {
    tbody.innerHTML = '';
    if (contacts.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 3;
      td.textContent = 'Keine Kontakte';
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }
    contacts.forEach(c => {
      const tr = document.createElement('tr');
      const name = c.name || '';
      tr.innerHTML = `<td>${c.index}</td><td>${c.number}</td><td>${name}</td>`;
      tbody.appendChild(tr);
    });
  });
}

import { fetchContacts } from './contacts.js';
import { toggleRssiInterval } from './rssiInterval.js';
import { toggleGpsInterval } from './gpsInterval.js';

export const atCommands = [ 
  { label: "Geräteinfo", command: "ATI" },
  { label: "Zelleninfo", command: "AT+GCLI?" },
  { label: "Signalstärke", command: "AT+CSQ?" },
  { label: "Sig Interval", action: toggleRssiInterval, id: 'sigIntervalBtn' },
  { label: "Netzregistrierung", command: "AT+CREG?" },
  { label: "GPS", command: "AT+GPSPOS?" },
  { label: "GPS Interval", action: toggleGpsInterval, id: 'gpsIntervalBtn' },
  { label: "Gruppen", command: "AT+CTGL?" },
  { label: "Kontakte", action: fetchContacts },
  { label: "Scan an", command: "AT+CTSCAN=1" },
  { label: "Scan aus", command: "AT+CTSCAN=0" },
  { label: "TMO", command: "AT+CTOM=0" },
  { label: "DMO", command: "AT+CTOM=1" },
  { label: "Gateway", command: "AT+CTOM=5" },
  { label: "DMO Repeater", command: "AT+CTOM=6" },
  { label: "TG 262", command: "AT+CTGS=1,262" },
  { label: "TG 26200", command: "AT+CTGS=1,26200" },
  { label: "TG Notfunk", command: "AT+CTGS=1,91102" },
  { label: "TG 1", command: "AT+CTGS=1,1" },
  { label: "TG 2", command: "AT+CTGS=1,2" },
  { label: "TG 3", command: "AT+CTGS=1,3" },
  { label: "TG 4", command: "AT+CTGS=1,4" }
];

export function generateButtons(sendCommand, device = 1, containerId = device === 1 ? 'commandButtons' : 'commandButtons2') {
  const container = document.getElementById(containerId);
  if (!container) return;
  atCommands.forEach(({ label, command, action, id }) => {
    const btn = document.createElement('button');
    if (id) btn.id = device === 1 ? id : `${id}2`;
    btn.textContent = label;
    if (action) {
      btn.onclick = () => action(device);
    } else {
      btn.onclick = () => sendCommand(command, device);
    }
    container.appendChild(btn);
  });
}

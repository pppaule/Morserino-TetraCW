import { sendCommand } from './serial.js';
import { print } from './utils.js';

const rssiHandles = {};

export function toggleRssiInterval(device = 1) {
  const btn = document.getElementById(device === 1 ? 'sigIntervalBtn' : 'sigIntervalBtn2');
  if (rssiHandles[device]) {
    clearInterval(rssiHandles[device]);
    delete rssiHandles[device];
    if (btn) btn.textContent = 'Sig Interval';
    print('🛑 Signalstärke-Intervall gestoppt', device);
  } else {
    sendCommand('AT+CSQ?', device);
    rssiHandles[device] = setInterval(() => sendCommand('AT+CSQ?', device), 30000);
    if (btn) btn.textContent = 'Stop Sig Interval';
    print('⏲️ Signalstärke-Intervall gestartet (30s)', device);
  }
}

import { sendCommand } from './serial.js';
import { print } from './utils.js';

const gpsHandles = {};

export function toggleGpsInterval(device = 1) {
  const btn = document.getElementById(device === 1 ? 'gpsIntervalBtn' : 'gpsIntervalBtn2');
  if (gpsHandles[device]) {
    clearInterval(gpsHandles[device]);
    delete gpsHandles[device];
    if (btn) btn.textContent = 'GPS Interval';
    print('🛑 GPS-Intervall gestoppt', device);
  } else {
    sendCommand('AT+GPSPOS?', device);
    gpsHandles[device] = setInterval(() => sendCommand('AT+GPSPOS?', device), 30000);
    if (btn) btn.textContent = 'Stop GPS Interval';
    print('⏲️ GPS-Intervall gestartet (30s)', device);
  }
}

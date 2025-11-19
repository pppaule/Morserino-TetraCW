import { print, delay } from './utils.js';
import SerialConnection from './serialConnection.js';

const connections = {};
export const defaultInitCommands = [
  'ATE0',
  'AT+CSCS="8859-1"',
  'AT+CTSP=1,1,11',
  'AT+CTSP=2,0,0',
  'AT+CREG=2',
  'AT+IFC=0,0',
  'AT+CTSP=1,3,2',
  'ATI',
  'AT+GMI',
  'AT+CTGS?',
  'AT+CTSP=2,2,20',
  'AT+CTSP=1,3,130',
  'AT+CTSP=1,3,137',
  'AT+CTSP=1,3,138',
  'AT+CTSP=1,3,140',
  'AT+GMI?',
  'AT+CNUMF?',
  'AT+GMM',
  'ATI1',
  'AT+CTSP=1,3,3',
  'AT+CTSP=1,3,131',
  'AT+CTSP=1,3,10',
  'AT+CTSP=1,3,224',
  'AT+CTSP=1,3,195',
  'AT+CTSP=1,3,204',
  'AT+CTSP=1,3,210',
  'AT+CTSP=1,3,220',
  'AT+CTSP=1,3,242',
  'ATI7',
  'AT+CTGL=0,0,1',
  'AT+MCDNTN=ComPort-Verbunden,TETRA-Terminal,10,4'
];

export async function connectSerial(device = 1) {
  try {
    let conn = connections[device];
    if (!conn) {
      conn = new SerialConnection(device);
      connections[device] = conn;
    }
    conn.connect();
  } catch (e) {
    print('❌ Fehler beim Verbinden: ' + e, device);
  }
}

export async function disconnectSerial(device = 1) {
  const conn = connections[device];
  if (conn) {
    conn.disconnect();
    delete connections[device];
  }
  print(`🔌 Verbindung ${device} getrennt`, device);
}

export async function sendCommand(cmd, device = 1) {
  const conn = connections[device];
  if (!conn || !conn.sendCommand(cmd)) {
    print('⚠️ Nicht verbunden', device);
  }
}

export async function runInitialSetup(commands = defaultInitCommands, device = 1) {
  const cmds = Array.isArray(commands) && commands.length ? commands : defaultInitCommands;
  for (const cmd of cmds) {
    await sendCommand(cmd, device);
    await delay(200);
  }
}

export async function enableAllTnp1Profiles(device = 1) {
  for (let i = 0; i <= 15; i++) {
    await sendCommand(`AT+CTSP=1,${i},1`, device);
    await delay(100);
  }
  print('✅ Alle TNP1 Service-Profile aktiviert', device);
}

export async function enableTnp1Profile(profile, device = 1) {
  const idx = parseInt(profile, 10);
  if (isNaN(idx) || idx < 0 || idx > 15) {
    return print('⚠️ Ungültiges Profil', device);
  }
  await sendCommand(`AT+CTSP=1,${idx},1`, device);
  print(`✅ TNP1 Service-Profile ${idx} aktiviert`, device);
}


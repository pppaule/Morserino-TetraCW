import { print, delay } from './utils.js';
import { sendCommand } from './serial.js';
import { logSds } from './db.js';

export const gpsRequestRetries = { 1: {}, 2: {} };
export let lastGpsIssi = { 1: null, 2: null };
export const ackType = { 1: 0, 2: 0 };

export function setAckType(val, device = 1) {
  ackType[device] = parseInt(val, 10) || 0;
}

export async function sendSdsHex(dest, hex, type = 0, device = 1) {
  if (!dest || !hex) {
    return print('⚠️ Ziel und Daten erforderlich', device);
  }

  const bitLength = hex.length * 4;

  try {
    await sendCommand('AT+CTSDS=12,' + type + ',0,0,0', device);
    await delay(300);
    await sendCommand(`AT+CMGS=${dest},${bitLength}`, device);
    await delay(4000);
    await sendCommand(hex + String.fromCharCode(26), device);
    print(`✅ SDS an ${dest} gesendet`, device);
    logSds({ direction: 'out', dest, hex, type });
  } catch (err) {
    print('❌ Fehler beim Senden der SDS-Daten: ' + err, device);
  }
}

export async function sendSds(device = 1) {
  const suffix = device === 1 ? '' : '2';
  const dest = document.getElementById(`destination${suffix}`).value.trim();
  const msg = document.getElementById(`message${suffix}`).value.trim();
  const type = document.getElementById(`sdsType${suffix}`).value;

  if (!dest || !msg) return print('⚠️ Zielnummer und Nachricht erforderlich', device);

  const textHex = [...msg].map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('').toUpperCase();
  const pdu = '8200010D' + textHex;
  const bitLength = (pdu.length / 2) * 8;

  try {
    await sendCommand('AT+CTSP=1,3,2', device);
    await delay(200);
    await sendCommand(`AT+CTSDS=12,${type},0,0,0`, device);
    await delay(200);
    await sendCommand(`AT+CMGS=${dest},${bitLength}`, device);
    await delay(4000);
    await sendCommand(pdu + String.fromCharCode(26), device);
    print('✅ SDS gesendet', device);
    logSds({ direction: 'out', dest, message: msg, type });
  } catch (err) {
    print('❌ Fehler beim Senden der SDS: ' + err, device);
  }
}

export async function sendTextSds(dest, msg, type = 0, device = 1) {
  if (!dest || !msg) return print('⚠️ Zielnummer und Nachricht erforderlich', device);

  const textHex = [...msg].map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('').toUpperCase();
  const pdu = '8200010D' + textHex;
  const bitLength = (pdu.length / 2) * 8;

  try {
    await sendCommand('AT+CTSP=1,3,2', device);
    await delay(200);
    await sendCommand(`AT+CTSDS=12,${type},0,0,0`, device);
    await delay(200);
    await sendCommand(`AT+CMGS=${dest},${bitLength}`, device);
    await delay(4000);
    await sendCommand(pdu + String.fromCharCode(26), device);
    print(`✅ SDS an ${dest} gesendet`, device);
    logSds({ direction: 'out', dest, message: msg, type });
  } catch (err) {
    print('❌ Fehler beim Senden der SDS: ' + err, device);
  }
}

export async function sendSdsRaw(retryCount = 0, issiOverride = null, device = 1) {
  const suffix = device === 1 ? '' : '2';
  const issi = issiOverride || document.getElementById(`gpsIssi${suffix}`).value.trim();
  if (!issi) return print('⚠️ ISSI fehlt', device);

  lastGpsIssi[device] = issi;
  gpsRequestRetries[device][issi] = retryCount;

  try {
    await sendLipRequest(issi, device);
    print(`✅ GPS-SDS an ISSI ${issi} gesendet (Versuch ${retryCount + 1})`, device);
  } catch (err) {
    print('❌ Fehler beim Senden der SDS-Rohdaten: ' + err, device);
  }
}

export async function requestGps(device = 1) {
  const suffix = device === 1 ? '' : '2';
  const issi = document.getElementById(`gpsIssi${suffix}`).value;
  if (!issi) return print('⚠️ ISSI fehlt', device);
  await sendSdsRaw(0, issi, device);
}

export function sendLipRequest(issi, device = 1) {
  const hex = '0A4591C128293D';
  return sendSdsHex(issi, hex, 0, device);
}

export function sendLongLipRequest(issi, device = 1) {
  const hex = '0A4591C128293D00';
  return sendSdsHex(issi, hex, 0, device);
}

export function sendLrrpRequest(issi, device = 1) {
  const hex = '0B01A1000000';
  return sendSdsHex(issi, hex, 0, device);
}

export async function sendSdsAck(issi, device = 1) {
  const type = ackType[device];
  if (!type) return;
  try {
    if (type === 1) {
      await sendCommand(`AT+CTSDSW=${issi},1,"41434B"`, device);
      logSds({ direction: 'out', dest: issi, hex: '41434B', type: 1 });
      print(`✅ SDS Ack an ${issi} gesendet`, device);
    } else if (type === 2) {
      await sendCommand(`AT+CTSDSW=${issi},2,"0001"`, device);
      logSds({ direction: 'out', dest: issi, hex: '0001', type: 2 });
      print(`✅ Status Ack an ${issi} gesendet`, device);
    }
  } catch (err) {
    print('❌ Fehler beim Senden der SDS-Ack: ' + err, device);
  }
}

import { print, lookupIssi, isIssiLookupEnabled } from './utils.js';
import { updateMap, updateHousePosition, gpsPositions, addTrackPointForCurrent } from './map.js';
import { sendSdsRaw, gpsRequestRetries, sendSdsAck } from './sds.js';
import { logGps, logSds } from './db.js';
import { addRssi } from './rssiChart.js';
import { markGroupActive } from './tgDisplay.js';
import { runProfile } from './profiles.js';
import { sendCommand } from './serial.js';
import { getSdsMappings } from './sdsMappings.js';

const lineListeners = [];

export function addLineListener(fn) {
  if (typeof fn === 'function') lineListeners.push(fn);
}

export function removeLineListener(fn) {
  const idx = lineListeners.indexOf(fn);
  if (idx >= 0) lineListeners.splice(idx, 1);
}

const pendingCtsdsr = { 1: null, 2: null };
const pendingGcliLines = { 1: 0, 2: 0 };

const knownTgs = ['1', '2', '3', '4', '91102', '262', '26200'];

const callRefToTg = { 1: {}, 2: {} };

function triggerSdsMappings({ status, text, fromIssi }, sourceDevice = 1) {
  const mappings = getSdsMappings();
  mappings.forEach(m => {
    const statusMatch = m.status && status && m.status.toUpperCase() === status.toUpperCase();
    const textMatch = m.text && text && m.text === text;
    const issiMatch = !m.issis || !m.issis.length || m.issis.includes(fromIssi);
    if ((statusMatch || textMatch) && (m.sourceDevice || 1) === sourceDevice && issiMatch) {
      runProfile(m.profile, sendCommand, m.targetDevice || 1);
      print(`▶️ AT-Profil ${m.profile} ausgelöst`, m.targetDevice || 1);
    }
  });
}


function parseGroupActivity(line, device = 1) {
  let tg = null;
  let issi = null;
  let ref = null;

  if (line.startsWith('+CTICN:')) {
    const parts = line.split(':')[1].split(',').map(p => p.trim());
    if (parts.length >= 6) {
      ref = parts[0];
      issi = parts[4];
      tg = parts[parts.length - 2];
      callRefToTg[device][ref] = tg;
    }
  } else if (line.startsWith('+CTGS:')) {
    const parts = line.split(':')[1].split(',').map(p => p.trim());
    if (parts.length >= 2) {
      ref = parts[0];
      tg = parts[1];
      callRefToTg[device][ref] = tg;
    }
  } else if (line.startsWith('+CTXG:')) {
    const parts = line.split(':')[1].split(',').map(p => p.trim());
    if (parts.length >= 6) {
      ref = parts[0];
      issi = parts[5];
      tg = callRefToTg[device][ref];
    }
  } else if (line.startsWith('+CTCR:')) {
    const parts = line.split(':')[1].split(',').map(p => p.trim());
    if (parts.length >= 1) {
      ref = parts[0];
      delete callRefToTg[device][ref];
    }
  }

  if (tg && knownTgs.includes(tg)) {
    markGroupActive(tg, issi, device);
  }
  if (issi && isIssiLookupEnabled()) {
    lookupIssi(issi, device);
  }
}

export function handleData(data, device = 1) {
  const lines = data.split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    print('⬅️ ' + line, device);
    parseGroupActivity(line, device);

    lineListeners.forEach(fn => {
      try { fn(line, device); } catch (e) { console.error(e); }
    });

    if (line.includes('+CME ERROR: 35')) {
      print('⚠️ Hinweis: CME ERROR 35 — ggf. harmlos (Nachricht evtl. trotzdem gesendet)', device);
      continue;
    }

    if (line.startsWith('+CTSDSR')) {
      pendingCtsdsr[device] = line;
      continue;
    } else if (pendingCtsdsr[device] && line.match(/^\s*,/)) {
      pendingCtsdsr[device] += line;
      continue;
    } else if (pendingCtsdsr[device] && /^[0-9A-Fa-f]+$/.test(line.trim())) {
      parseSds(line.trim(), pendingCtsdsr[device], device);
      pendingCtsdsr[device] = null;
      continue;
    }

    if (line.startsWith('+GCLI:')) {
      const count = parseInt(line.split(':')[1]);
      if (!isNaN(count)) pendingGcliLines[device] = count;
      continue;
    } else if (pendingGcliLines[device] > 0) {
      parseGcliEntry(line);
      pendingGcliLines[device]--;
      continue;
    }

    if (line.startsWith('+CSQ: ')) parseSignalStrength(line, device);
    if (line.startsWith('+CREG:')) parseCreg(line, device);
    if (line.includes('+GPSPOS:')) parseGps(line, device);
    if (line.includes('+CMGS:')) print('✅ Empfangsbestätigung: ' + line, device);
  }
}

export function parseSignalStrength(line, device = 1) {
  const match = /\+CSQ:\s*(\d+)/.exec(line);
  if (match) {
    const rssi = parseInt(match[1]);
    const dbm = -113 + rssi * 2;
    print(`📶 RSSI: ${rssi} → ${dbm} dBm`, device);
    addRssi(dbm, device);
  }
}

export function parseCreg(line, device = 1) {
  // Try to detect explicit dBm values first
  const dbmMatch = /(-?\d+)\s*dBm/i.exec(line);
  if (dbmMatch) {
    const dbm = parseInt(dbmMatch[1]);
    if (!isNaN(dbm)) {
      print(`📶 CREG: ${dbm} dBm`, device);
      addRssi(dbm, device);
      return;
    }
  }

  // Otherwise look for a RSSI-style value (0-31) at the end
  const parts = line.split(',');
  const rssiVal = parseInt(parts[parts.length - 1]);
  if (!isNaN(rssiVal) && rssiVal >= 0 && rssiVal <= 31) {
    const dbm = -113 + rssiVal * 2;
    print(`📶 CREG RSSI: ${rssiVal} → ${dbm} dBm`, device);
    addRssi(dbm, device);
  }
}

export function parseGps(line, device = 1) {
  const match = /\+GPSPOS:\s+\d{2}:\d{2}:\d{2},N:\s*(\d{2})_(\d{2}\.\d+),E:\s*(\d{3})_(\d{2}\.\d+)/.exec(line);
  if (match) {
    const [latD, latM, lonD, lonM] = match.slice(1).map(Number);
    const lat = latD + latM / 60;
    const lon = lonD + lonM / 60;
    if (!isNaN(lat) && !isNaN(lon)) {
      updateHousePosition(lat, lon, device);
      logGps({ from: 'terminal', lat, lon });
    }
  } else {
    print('⚠️ Unbekanntes GPS-Format', device);
  }
}

export function parseGcliEntry(line, device = 1) {
  const parts = line.split(',');
  if (parts.length < 4) return;
  const cell = parts[0].trim();
  const freq = parts[1].trim();
  const rssiVal = parseInt(parts[2]);
  if (!isNaN(rssiVal)) {
    const dbm = -113 + rssiVal * 2;
    print(`📶 GCLI Zelle ${cell} (${freq}): ${rssiVal} → ${dbm} dBm`, device);
  } else {
    print(`📶 GCLI: ${line}`, device);
  }
}

export function parseSds(line, previousLine = '', device = 1) {
  if (!previousLine.includes('+CTSDSR')) return;

  const parts = previousLine.split(',');
  const sdsType = parts[2]?.trim();
  const fromIssi = parts[1]?.trim() || 'Unbekannt';
  const destIssi = parts[3]?.trim() || null;
  const hex = line.trim();

  logSds({ direction: 'in', from: fromIssi, dest: destIssi, hex });

  print(`🧪 Verarbeite SDS-Antwort von ISSI ${fromIssi}`, device);
  print(`🧪 Hexdaten: ${hex}`, device);
  print(`🧪 Länge: ${hex.length} Zeichen (${(hex.length / 2).toFixed(1)} Bytes)`, device);

  const upperHex = hex.toUpperCase();
  if (upperHex === '8200010D06' || upperHex === '41434B') {
    print(`✅ ACK von ${fromIssi}`, device);
    return;
  }

  if (sdsType === '2') {
    const statusHex = hex.toUpperCase();
    print(`📩 Status-SDS von ${fromIssi}: ${statusHex}`, device);
    triggerSdsMappings({ status: statusHex, fromIssi }, device);
    sendSdsAck(fromIssi, device);
    return;
  }

  if (hex.startsWith('8200010D')) {
    const text = hexToAscii(hex.slice(8));
    print(`📩 Text-SDS von ${fromIssi}: ${text}`, device);
    triggerSdsMappings({ text, fromIssi }, device);
    sendSdsAck(fromIssi, device);
    return;
  }

  // Heuristic: if the payload after the first 4 bytes is mostly printable ASCII,
  // treat it as a text SDS to avoid misinterpreting it as GPS data.
  if (isLikelyText(hex.slice(8))) {
    const text = hexToAscii(hex.slice(8));
    print(`📩 Text-SDS von ${fromIssi}: ${text}`, device);
     triggerSdsMappings({ text, fromIssi }, device);
    sendSdsAck(fromIssi, device);
    return;
  }

  // handle compact LIP messages (0x0A protocol identifier)
  if (hex.length === 22 && hex.startsWith('0A')) {
    parseCompactLipSds(hex, fromIssi, device);
    sendSdsAck(fromIssi, device);
    return;
  }

  if (hex.length >= 18) {
    parseLipSds(hex, fromIssi, device);
    if (hex.length >= 40) parseLongLipSds(hex, fromIssi, device);
    if (hex.startsWith('01') || hex.startsWith('81')) parseLrrpSds(hex, fromIssi, device);
  } else {
    print(`⚠️ SDS-Daten zu kurz für GPS-Parsing: ${hex}`, device);
    if (hex.length >= 8) {
      const text = hexToAscii(hex.slice(8));
      print(`📩 Text-SDS von ${fromIssi}: ${text}`, device);
      triggerSdsMappings({ text, fromIssi }, device);
    }
    sendSdsAck(fromIssi, device);
    return;
  }

  const latHex = hex.slice(10, 18);
  const latRaw = parseLittleEndianSigned(latHex) / 1e6;
  print(`🧪 LAT HEX: ${latHex} → ${latRaw}`, device);

  let lonRaw = NaN;
  if (hex.length >= 26) {
    let lonHex = hex.slice(18, 26);
    print(`🧪 LON HEX (original): ${lonHex}`, device);

    if (lonHex.length === 6) {
      lonHex += '00';
      print(`🧪 LON HEX (aufgefüllt): ${lonHex}`, device);
    }

    if (lonHex.length === 8) {
      lonRaw = parseLittleEndianSigned(lonHex) / 1e6;
      print(`🧪 LON Wert: ${lonRaw}`, device);
    }
  } else {
    print(`⚠️ LON-Feld nicht vorhanden`, device);
  }

  let speed = null, heading = null, accuracy = null;

  if (hex.length >= 30) {
    const speedHex = hex.slice(26, 30);
    speed = parseInt(swapBytes(speedHex), 16) / 10;
    print(`🧪 SPEED: ${speedHex} → ${speed} km/h`, device);
  }

  if (hex.length >= 34) {
    const headingHex = hex.slice(30, 34);
    heading = parseInt(swapBytes(headingHex), 16);
    print(`🧪 HEADING: ${headingHex} → ${heading}°`, device);
  }

  if (hex.length >= 36) {
    const accuracyHex = hex.slice(34, 36);
    accuracy = parseInt(accuracyHex, 16);
    print(`🧪 ACCURACY: ${accuracyHex} → ±${accuracy} m`, device);
  }

  if (!isNaN(latRaw) && !isNaN(lonRaw)) {
    gpsPositions[fromIssi] = { lat: latRaw, lon: lonRaw };
    addTrackPointForCurrent(latRaw, lonRaw);
    logGps({ from: fromIssi, lat: latRaw, lon: lonRaw, speed, heading, accuracy });
    let info = `📍 GPS von ISSI ${fromIssi}: ${latRaw.toFixed(6)}, ${lonRaw.toFixed(6)}`;
    if (speed != null) info += ` 🚗 ${speed.toFixed(1)} km/h`;
    if (heading != null) info += ` 🧭 ${heading}°`;
    if (accuracy != null) info += ` ±${accuracy} m`;
    print(info, device);
    updateMap();
    gpsRequestRetries[device][fromIssi] = 0;
  } else if (!isNaN(latRaw)) {
    print(`⚠️ Nur LAT empfangen von ISSI ${fromIssi}: ${latRaw.toFixed(6)}, LON fehlt`, device);
    const retryCount = gpsRequestRetries[device][fromIssi] || 0;
    if (retryCount < 2) {
      print(`🔁 SDS-Antwort zu kurz – versuche erneut (Versuch ${retryCount + 2}/3)`, device);
      setTimeout(() => sendSdsRaw(retryCount + 1, fromIssi, device), 1000);
    } else {
      print(`❌ Maximale Wiederholungsversuche erreicht. Keine vollständige GPS-Antwort.`, device);
    }
  } else {
    print(`⚠️ Ungültige GPS-Daten empfangen: ${hex}`, device);
  }
  sendSdsAck(fromIssi, device);
}

function parseLipSds(hex, issi, device = 1) {
  print(`🧪 SDS (LIP) von ISSI ${issi}: ${hex}`, device);

  if (hex.length < 26) {
    print('⚠️ LIP-Daten zu kurz für vollständige Koordinaten', device);
    return;
  }

  const latHex = hex.slice(10, 18);
  const lonHex = hex.slice(18, 26);

  const lat = parseLittleEndianSigned(latHex) / 1e6;
  const lon = parseLittleEndianSigned(lonHex) / 1e6;

  let speed = null, heading = null, accuracy = null;

  if (hex.length >= 30) {
    const speedHex = hex.slice(26, 30);
    speed = parseInt(swapBytes(speedHex), 16) / 10;
  }

  if (hex.length >= 34) {
    const headingHex = hex.slice(30, 34);
    heading = parseInt(swapBytes(headingHex), 16);
  }

  if (hex.length >= 36) {
    const accHex = hex.slice(34, 36);
    accuracy = parseInt(accHex, 16);
  }

  gpsPositions[issi] = { lat, lon };
  addTrackPointForCurrent(lat, lon);
  logGps({ from: issi, lat, lon, speed, heading, accuracy });

  let info = `📍 GPS von ISSI ${issi}: ${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  if (speed != null) info += ` 🚗 ${speed.toFixed(1)} km/h`;
  if (heading != null) info += ` 🧭 ${heading}°`;
  if (accuracy != null) info += ` ±${accuracy} m`;

  print(info, device);
  updateMap();
}

function parseLongLipSds(hex, issi, device = 1) {
  print(`🧪 SDS (Long LIP) von ISSI ${issi}: ${hex}`, device);
  if (hex.length < 40) {
    print('⚠️ Long LIP Daten zu kurz', device);
    return;
  }
  const latHex = hex.slice(10, 18);
  const lonHex = hex.slice(18, 26);
  const altHex = hex.slice(26, 30);
  const lat = parseLittleEndianSigned(latHex) / 1e6;
  const lon = parseLittleEndianSigned(lonHex) / 1e6;
  const alt = parseInt(swapBytes(altHex), 16);
  gpsPositions[issi] = { lat, lon };
  addTrackPointForCurrent(lat, lon);
  logGps({ from: issi, lat, lon, altitude: alt });
  print(`📍 Long LIP ${issi}: ${lat.toFixed(6)}, ${lon.toFixed(6)} → ${alt} m`, device);
  updateMap();
}

function parseCompactLipSds(hex, issi, device = 1) {
  print(`🧪 SDS (Compact LIP) von ISSI ${issi}: ${hex}`, device);
  if (hex.length !== 22) {
    print('⚠️ Compact LIP Daten ungültig', device);
    return;
  }
  const latHex = hex.slice(4, 10);
  const lonHex = hex.slice(10, 16);
  const speedHex = hex.slice(16, 18);
  const headingHex = hex.slice(18, 20);
  const accHex = hex.slice(20, 22);

  const latVal = parse24Signed(latHex);
  const lonVal = parse24Signed(lonHex);

  // offsets derived from ETSI LIP compact representation
  const COMPACT_LAT_OFFSET = 1.554624;
  const COMPACT_LON_OFFSET = 43.044569;

  const lat = latVal / 131072 - COMPACT_LAT_OFFSET;
  const lon = lonVal / 131072 - COMPACT_LON_OFFSET;

  let speed = null, heading = null, accuracy = null;
  if (speedHex) speed = parseInt(speedHex, 16);
  if (headingHex) heading = parseInt(headingHex, 16);
  if (accHex) accuracy = parseInt(accHex, 16);

  gpsPositions[issi] = { lat, lon };
  addTrackPointForCurrent(lat, lon);
  logGps({ from: issi, lat, lon, speed, heading, accuracy });

  let info = `📍 GPS von ISSI ${issi}: ${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  if (speed != null) info += ` 🚗 ${speed} km/h`;
  if (heading != null) info += ` 🧭 ${heading}°`;
  if (accuracy != null) info += ` ±${accuracy} m`;
  print(info, device);
  updateMap();
}

function parseLrrpSds(hex, issi, device = 1) {
  print(`🧪 SDS (LRRP) von ISSI ${issi}: ${hex}`, device);
  if (hex.length < 28) return;
  const latHex = hex.slice(12, 20);
  const lonHex = hex.slice(20, 28);
  const lat = parseLittleEndianSigned(latHex) / 1e6;
  const lon = parseLittleEndianSigned(lonHex) / 1e6;
  gpsPositions[issi] = { lat, lon };
  addTrackPointForCurrent(lat, lon);
  logGps({ from: issi, lat, lon });
  print(`📍 LRRP ${issi}: ${lat.toFixed(6)}, ${lon.toFixed(6)}`, device);
  updateMap();
}

function parse24Signed(hex) {
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return NaN;
  let val = parseInt(hex, 16);
  if (val & 0x800000) val -= 0x1000000;
  return val;
}

function parseLittleEndianSigned(hex) {
  if (!/^[0-9a-fA-F]{8}$/.test(hex)) return NaN;
  const bytes = hex.match(/../g);
  const reversed = bytes.reverse().join('');
  return hexToSigned(reversed);
}

function hexToSigned(hex) {
  const num = parseInt(hex, 16);
  const bitLength = hex.length * 4;
  const max = 1 << (bitLength - 1);
  return num >= max ? num - (1 << bitLength) : num;
}

function swapBytes(hex) {
  const bytes = hex.match(/../g);
  if (!bytes || bytes.length !== 2) return hex;
  return bytes.reverse().join('');
}

function hexToAscii(hex) {
  let text = '';
  for (let i = 0; i < hex.length; i += 2) {
    const code = parseInt(hex.slice(i, i + 2), 16);
    if (!isNaN(code)) text += String.fromCharCode(code);
  }
  return text;
}

function isLikelyText(hex) {
  const ascii = hexToAscii(hex);
  if (!ascii) return false;
  let printable = 0;
  for (const ch of ascii) {
    const code = ch.charCodeAt(0);
    if (code >= 32 && code <= 126) printable++;
  }
  return printable / ascii.length > 0.8;
}

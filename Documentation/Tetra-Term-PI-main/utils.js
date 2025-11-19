export const logEntries = [];
let issiLookupEnabled = false;
const issiCache = {};

export function getTimestamp() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

export function setIssiLookup(val) {
  issiLookupEnabled = val;
}

export function isIssiLookupEnabled() {
  return issiLookupEnabled;
}

export async function lookupIssi(issi, device = 1) {
  if (issiCache[issi]) {
    print(`ℹ️ ISSI ${issi}: ${issiCache[issi]}`, device);
    return;
  }
  try {
    const data = await fetch(`https://database.radioid.net/api/dmr/user/?id=${issi}`).then(r => r.json());
    const info = (data && data.results && data.results[0]) || null;
    const text = info
      ? `${info.callsign || '–'} ${info.fname || ''} ${info.surname || ''} (${info.city || ''}, ${info.country || ''})`.replace(/\s+/g, ' ').trim()
      : 'Keine Informationen';
    issiCache[issi] = text;
    print(`ℹ️ ISSI ${issi}: ${text}`, device);
  } catch {
    print(`ℹ️ ISSI ${issi}: Lookup Fehler`, device);
  }
}

export function print(text, device = 1) {
  const out = document.getElementById(device === 1 ? 'output1' : 'output2');
  if (out) {
    out.value += text + "\n";
    out.scrollTop = out.scrollHeight;
  }
  if (text.startsWith('📩 Text-SDS') || text.startsWith('📍 GPS von ISSI')) {
    const msgOut = document.getElementById(device === 1 ? 'sdsMessages' : 'sdsMessages2');
    if (msgOut) {
      msgOut.value += text + '\n';
      msgOut.scrollTop = msgOut.scrollHeight;
    }
  }
  if (issiLookupEnabled && !text.startsWith('ℹ️ ISSI')) {
    const match = text.match(/ISSI\s(\d+)/);
    if (match) lookupIssi(match[1], device);
  }
  logEntries.push({ timestamp: getTimestamp(), device, text });
}

export function delay(ms) {
  return new Promise(res => setTimeout(res, ms));
}

export function exportToCsv() {
  const rows = ["timestamp,text"];
  logEntries.forEach(entry => {
    rows.push(`"${entry.timestamp}","${entry.text.replace(/"/g, '""')}"`);
  });
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "log.csv";
  link.click();
}

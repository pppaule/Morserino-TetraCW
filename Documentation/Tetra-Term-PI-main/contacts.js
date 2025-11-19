// Functions to fetch contacts from Terminal and store in MySQL
import { sendCommand } from './serial.js';
import { delay, print } from './utils.js';
import { addLineListener, removeLineListener } from './parsing.js';
import { saveContacts } from './db.js';

export async function fetchContacts(device = 1) {
  const contacts = [];
  let done = false;
  let maxIndex = 999;
  let rawLines = [];

  const listener = (line, dev) => {
    if (dev !== device) return;
    if (line === 'OK' || line.startsWith('ERROR')) {
      done = true;
    } else if (line.startsWith('+CPBS:')) {
      const m = line.match(/\+CPBS:\s*"[^\"]+",\s*(\d+),(\d+)/);
      if (m) maxIndex = parseInt(m[2]);
    } else if (line.startsWith('+CPBR:') || /^[0-9]/.test(line)) {
      rawLines.push(line.trim());
    }
  };

  addLineListener(listener);

  await sendCommand('AT+CPBS="ME"', device);
  await delay(200);
  await sendCommand('AT+CPBS?', device);
  await delay(500);

  const parseBatch = (lines, expected) => {
    const parsed = [];
    if (!lines.length) return parsed;
    const all = lines.join('').replace(/\r?\n/g, '').replace(/\+CPBR:\s*/g, '');
    const tokens = all.split(',');
    for (let i = 0; i < tokens.length - 3;) {
      if (tokens[i] === String(expected)) {
        const index = expected;
        const number = (tokens[i + 1] || '').replace(/"/g, '').trim();
        const type = parseInt(tokens[i + 2]);
        const name = (tokens[i + 3] || '').replace(/"/g, '').trim();
        parsed.push({ index, number, type, name });
        expected++;
        i += 4;
        continue;
      }
      i++;
    }
    return parsed;
  };

  for (let startIdx = 1; startIdx <= maxIndex; startIdx += 100) {
    const endIdx = Math.min(maxIndex, startIdx + 99);
    rawLines = [];
    done = false;
    await sendCommand(`AT+CPBR=${startIdx},${endIdx}`, device);
    const start = Date.now();
    while (!done && Date.now() - start < 60000) {
      await delay(100);
    }
    contacts.push(...parseBatch(rawLines, startIdx));
  }

  removeLineListener(listener);

  if (contacts.length) {
    saveContacts(contacts);
    print(`✅ ${contacts.length} Kontakte gespeichert`, device);
  } else {
    print('⚠️ Keine Kontakte gelesen', device);
  }
}

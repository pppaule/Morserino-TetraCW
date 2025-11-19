import { WebSocketServer } from 'ws';
import { SerialPort } from 'serialport';
import express from 'express';
import mysql from 'mysql2/promise';
import cors from 'cors';
import fs from 'fs';
import { spawn } from 'child_process';
import './coreWsLogger.js';
const wss = new WebSocketServer({ port: 8080 });

// Redirect console.log output to connected WebSocket clients instead of syslog
console.log = (...args) => {
  const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  const match = msg.match(/^dev(\d+)/);
  const device = match ? parseInt(match[1], 10) : null;
  wss.clients.forEach(client => {
    if (client.readyState === client.OPEN) {
      client.send(JSON.stringify({ type: 'log', device, data: msg }));
    }
  });
};

const configPath = new URL('./tetraterm.conf', import.meta.url);
let tetratermConfig;
try {
  const raw = fs.readFileSync(configPath, 'utf-8').replace(/__ISSI\d+__/g, '0');
  tetratermConfig = JSON.parse(raw);
} catch (e) {
  console.error('Failed to read tetraterm.conf, using defaults', e.message);
  tetratermConfig = { audioDevice: null, baudRate: 115200, ttys: [], devices: {} };
}

const defaultInitCommands = [
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

function delay(ms) {
  return new Promise(res => setTimeout(res, ms));
}

async function runInitialSetup(port, commands = defaultInitCommands) {
  for (const cmd of commands) {
    port.write(cmd + '\r\n');
    await delay(200);
  }
}

const deviceNums = Object.entries(tetratermConfig.devices || {})
  .filter(([, opts]) => Number.isFinite(parseInt(opts.issi, 10)))
  .map(([d]) => parseInt(d, 10));
const ports = {};
const clients = {};
const audioClients = {};
for (const dev of deviceNums) {
  clients[dev] = new Set();
  audioClients[dev] = new Set();
}
let recProcess = null;
let playProcess = null;
const issiMap = {};
for (const [dev, opts] of Object.entries(tetratermConfig.devices || {})) {
  const issi = parseInt(opts.issi, 10);
  if (Number.isFinite(issi)) {
    issiMap[String(issi)] = parseInt(dev, 10);
  }
}

function enableVoiceServiceProfiles(port, dev) {
  const cmds = ['AT+CTSP=1,3,3', 'AT+CTSP=1,3,10'];
  for (const cmd of cmds) {
    port.write(cmd + '\r\n');
    console.log(`dev${dev} -> ${cmd}`);
  }
}

for (const tty of tetratermConfig.ttys || []) {
  const port = new SerialPort({ path: tty, baudRate: tetratermConfig.baudRate, autoOpen: false });
  let buffer = '';
  const handleInitData = chunk => {
    buffer += chunk.toString();
    if (!buffer.includes('OK')) return;
    port.off('data', handleInitData);
    const match = buffer.match(/\+CNUMF:\s*\d+,([0-9]+)/);
    const issi = match ? match[1].slice(-7) : null;
    const deviceNum = issiMap[issi];
    if (!deviceNum) return;
    ports[deviceNum] = port;
    port.on('data', chunk2 => {
      const msg = JSON.stringify({ type: 'data', device: deviceNum, data: chunk2.toString() });
      clients[deviceNum].forEach(ws => {
        if (ws.readyState === ws.OPEN) ws.send(msg);
      });
    });
    port.on('error', err => {
      const msg = JSON.stringify({ type: 'error', device: deviceNum, data: String(err) });
      clients[deviceNum].forEach(ws => {
        if (ws.readyState === ws.OPEN) ws.send(msg);
      });
    });
    runInitialSetup(port, defaultInitCommands);
  };
  port.on('error', err => console.log(`Serial port ${tty} error: ${err.message}`));
  port.on('data', handleInitData);
  port.on('open', () => port.write('AT+CNUMF?\r\n'));
  port.open();
}

const audioDev = tetratermConfig.audioDevice;
if (audioDev && deviceNums.length > 0) {
  recProcess = spawn('arecord', ['-q', '-f', 'S16_LE', '-r', '8000', '-c', String(deviceNums.length), '-D', audioDev]);
  recProcess.on('error', err => console.log(`arecord error: ${err.message}`));
  recProcess.on('exit', code => console.log(`arecord exited with code ${code}`));
  recProcess.stdout.on('data', chunk => {
    const frameSize = deviceNums.length * 2;
    if (chunk.length % frameSize !== 0) return;
    const buffers = deviceNums.map(() => Buffer.alloc(chunk.length / deviceNums.length));
    const samples = chunk.length / frameSize;
    for (let s = 0; s < samples; s++) {
      const frameStart = s * frameSize;
      for (let ch = 0; ch < deviceNums.length; ch++) {
        chunk.copy(buffers[ch], s * 2, frameStart + ch * 2, frameStart + ch * 2 + 2);
      }
    }
    buffers.forEach((buf, idx) => {
      const dev = deviceNums[idx];
      const msg = JSON.stringify({ type: 'audio-chunk', device: dev, data: buf.toString('base64') });
      audioClients[dev].forEach(ws => { if (ws.readyState === ws.OPEN) ws.send(msg); });
    });
  });
  playProcess = spawn('aplay', ['-q', '-f', 'S16_LE', '-r', '8000', '-c', String(deviceNums.length), '-D', audioDev]);
  playProcess.on('error', err => console.log(`aplay error: ${err.message}`));
  playProcess.on('exit', code => console.log(`aplay exited with code ${code}`));
}

// MySQL connection pool. Prefer the local socket if available but fall back
// to TCP when the socket is missing. This prevents the server from crashing
// with ENOENT when MySQL is reachable only via network.
const dbConfig = {
  user: 'root',
  database: 'tetra',
  waitForConnections: true,
  connectionLimit: 10
};
const socket = '/var/run/mysqld/mysqld.sock';
if (fs.existsSync(socket)) {
  dbConfig.socketPath = socket;
} else {
  dbConfig.host = 'localhost';
  dbConfig.port = 3306;
}
const pool = mysql.createPool(dbConfig);
const memoryStore = {};

async function query(sql, params) {
  try {
    const [rows] = await pool.query(sql, params);
    return rows;
  } catch (e) {
    console.error('DB query failed', e.message);
    throw e;
  }
}

function stringifyObjects(obj) {
  const out = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val instanceof Date) {
      // Allow mysql2 to handle Date objects natively so they map to DATETIME
      // without being converted to JSON strings.
      out[key] = val;
    } else if (typeof val === 'string' && key.toLowerCase().includes('timestamp')) {
      // Convert ISO timestamp strings to Date so mysql2 stores them as DATETIME
      const parsed = new Date(val);
      out[key] = isNaN(parsed) ? val : parsed;
    } else if (val !== null && typeof val === 'object') {
      out[key] = JSON.stringify(val);
    } else {
      out[key] = val;
    }
  }
  return out;
}

function memInsert(table, data) {
  const arr = memoryStore[table] || (memoryStore[table] = []);
  const id = arr.length ? arr[arr.length - 1].id + 1 : 1;
  arr.push({ id, ...data });
  return id;
}

async function insert(table, data) {
  const row = stringifyObjects(data);
  try {
    const [result] = await pool.query('INSERT INTO ?? SET ? ON DUPLICATE KEY UPDATE ?', [table, row, row]);
    return result.insertId;
  } catch (e) {
    console.error(`Insert into ${table} failed`, e.message);
    return memInsert(table, data);
  }
}

try {
  await query(`CREATE TABLE IF NOT EXISTS dapnet_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    timestamp DATETIME,
    message JSON
  )`);

  await query(`CREATE TABLE IF NOT EXISTS at_profiles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) UNIQUE,
    commands JSON
  )`);

  await query(`CREATE TABLE IF NOT EXISTS sds_mappings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    status VARCHAR(50),
    text VARCHAR(255),
    issis JSON,
    sourceDevice INT,
    profile VARCHAR(255),
    targetDevice INT
  )`);

  await query(`CREATE TABLE IF NOT EXISTS dapnet_mappings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    address INT,
    func INT,
    text VARCHAR(255),
    regex TINYINT,
    device INT,
    issis JSON
  )`);

  await query(`CREATE TABLE IF NOT EXISTS commands (
    id INT AUTO_INCREMENT PRIMARY KEY,
    timestamp DATETIME,
    command TEXT
  )`);

  await query(`CREATE TABLE IF NOT EXISTS sds (
    id INT AUTO_INCREMENT PRIMARY KEY,
    timestamp DATETIME,
    direction VARCHAR(10),
    \`from\` VARCHAR(255),
    dest VARCHAR(255),
    hex TEXT,
    message TEXT,
    type VARCHAR(50)
  )`);

  await query(`CREATE TABLE IF NOT EXISTS contacts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    \`index\` INT,
    number VARCHAR(255),
    type INT,
    name VARCHAR(255)
  )`);

  await query(`CREATE TABLE IF NOT EXISTS web_status (
    id INT AUTO_INCREMENT PRIMARY KEY,
    site VARCHAR(255),
    state VARCHAR(255),
    \`groups\` TEXT,
    UNIQUE KEY uniq_site (site)
  )`);

  await query(`CREATE TABLE IF NOT EXISTS web_qrv (
    id INT AUTO_INCREMENT PRIMARY KEY,
    issi VARCHAR(255),
    callsign VARCHAR(255),
    site VARCHAR(255),
    \`groups\` TEXT,
    UNIQUE KEY uniq_issi (issi)
  )`);

  await query(`CREATE TABLE IF NOT EXISTS web_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    site VARCHAR(255),
    module VARCHAR(255),
    message TEXT,
    timestamp VARCHAR(255)
  )`);

  await query(`CREATE TABLE IF NOT EXISTS gps (
    id INT AUTO_INCREMENT PRIMARY KEY,
    timestamp DATETIME,
    \`from\` VARCHAR(255),
    lat DOUBLE,
    lon DOUBLE,
    speed DOUBLE,
    heading DOUBLE,
    accuracy DOUBLE,
    altitude DOUBLE
  )`);

  await query(`CREATE TABLE IF NOT EXISTS markers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    lat DOUBLE,
    lon DOUBLE,
    height DOUBLE,
    description TEXT,
    timestamp DATETIME
  )`);
  await query('ALTER TABLE markers ADD COLUMN height DOUBLE')
    .catch(() => {});

  await query(`CREATE TABLE IF NOT EXISTS tracks (
    id VARCHAR(255) PRIMARY KEY,
    points JSON
  )`);
} catch (e) {
  console.error('Failed to initialise MySQL tables', e);
}

const app = express();
// Disable HTTP caching so API responses always contain fresh data.
// Otherwise browsers might issue conditional requests that return 304
// and leave the frontend without payload, causing empty panels.
app.disable('etag');
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
// Allow larger JSON payloads to prevent PayloadTooLargeError
app.use(express.json({ limit: '10mb' }));
app.use(cors());

// Avoid 404 errors for missing favicons in browsers
app.get('/favicon.ico', (req, res) => res.status(204).end());


app.post('/api/:store', async (req, res) => {
  const store = req.params.store;
  const body = req.body;
  try {
    if (Array.isArray(body)) {
      for (const row of body) {
        await insert(store, row);
      }
      res.json({ ok: true });
    } else {
      const id = await insert(store, body);
      res.json({ ok: true, insertId: id });
    }
  } catch (e) {
    console.error('DB unavailable, using memory store', e.message);
    if (Array.isArray(body)) {
      body.forEach(row => memInsert(store, row));
      res.json({ ok: true });
    } else {
      const id = memInsert(store, body);
      res.json({ ok: true, insertId: id });
    }
  }
});

app.get('/api/:store', async (req, res) => {
  const store = req.params.store;
  try {
    let rows = await query('SELECT * FROM ??', [store]);
    rows = rows.map(r => {
      const out = {};
      for (const [key, val] of Object.entries(r)) {
        if (typeof val === 'string' && (val.startsWith('{') || val.startsWith('['))) {
          try {
            out[key] = JSON.parse(val);
            continue;
          } catch (e) {}
        }
        out[key] = val;
      }
      return out;
    });
    res.json(rows);
  } catch (e) {
    console.error('DB unavailable, serving from memory', e.message);
    res.json(memoryStore[store] || []);
  }
});

app.delete('/api/:store/:id', async (req, res) => {
  const store = req.params.store;
  const id = req.params.id;
  try {
    await query('DELETE FROM ?? WHERE id = ?', [store, id]);
    res.json({ ok: true });
  } catch (e) {
    console.error('DB unavailable, deleting from memory', e.message);
    const arr = memoryStore[store] || [];
    memoryStore[store] = arr.filter(r => String(r.id) !== String(id));
    res.json({ ok: true });
  }
});

app.delete('/api/:store', async (req, res) => {
  const store = req.params.store;
  try {
    await query('TRUNCATE TABLE ??', [store]);
    res.json({ ok: true });
  } catch (e) {
    console.error('DB unavailable, clearing memory store', e.message);
    memoryStore[store] = [];
    res.json({ ok: true });
  }
});

app.get('/api/export/json', async (req, res) => {
  const tables = ['commands','sds','gps','contacts','web_status','web_qrv','web_logs','markers','tracks'];
  const out = {};
  for (const t of tables) {
    try {
      out[t] = await query(`SELECT * FROM ${t}`);
    } catch (e) {
      out[t] = memoryStore[t] || [];
    }
  }
  res.json(out);
});

app.post('/api/import/json', async (req, res) => {
  const data = req.body || {};
  try {
    for (const table of Object.keys(data)) {
      const rows = data[table];
      await query('TRUNCATE TABLE ??', [table]);
      if (Array.isArray(rows)) {
        for (const row of rows) {
          await insert(table, row);
        }
      }
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('DB unavailable, importing into memory', e.message);
    for (const [table, rows] of Object.entries(data)) {
      if (Array.isArray(rows)) memoryStore[table] = rows;
    }
    res.json({ ok: true });
  }
});

app.listen(3000, () => console.log('REST API on http://localhost:3000'));

wss.on('connection', ws => {
  let device = null;
  let isAudio = false;

  ws.on('message', async msg => {
    try {
      const data = JSON.parse(msg.toString());
      if (data.type === 'register') {
        device = data.device;
        if (device) {
          if (!clients[device]) clients[device] = new Set();
          clients[device].add(ws);
          ws.send(JSON.stringify({ type: 'status', device, data: 'registered' }));
        }
      } else if (data.type === 'audio-register') {
        device = data.device;
        isAudio = true;
        if (device) {
          if (!audioClients[device]) audioClients[device] = new Set();
          audioClients[device].add(ws);
          ws.send(JSON.stringify({ type: 'status', device, data: 'audio-registered' }));
        }
      } else if (data.type === 'command') {
        const dev = data.device || device;
        const port = ports[dev];
        if (port) {
          port.write(data.data + '\r\n');
        }
      } else if (data.type === 'audio-chunk') {
        const dev = data.device || device;
        if (playProcess && dev) {
          const idx = deviceNums.indexOf(dev);
          if (idx !== -1) {
            const mono = Buffer.from(data.data, 'base64');
            const frameSize = deviceNums.length * 2;
            const samples = mono.length / 2;
            const multi = Buffer.alloc(samples * frameSize);
            for (let s = 0; s < samples; s++) {
              const monoStart = s * 2;
              for (let ch = 0; ch < deviceNums.length; ch++) {
                const dest = s * frameSize + ch * 2;
                if (ch === idx) {
                  mono.copy(multi, dest, monoStart, monoStart + 2);
                } else {
                  multi.writeInt16LE(0, dest);
                }
              }
            }
            playProcess.stdin.write(multi);
          }
        }
      } else if (data.type === 'ptt') {
        const dev = data.device || device;
        const port = ports[dev];
        if (port) {
          if (data.state) {
            enableVoiceServiceProfiles(port, dev);
            const target = (data.target || '').trim();
            // Always enable sidetone and TX, optionally dial target
            port.write('AT+CTSDC=1,1\r\n');
            console.log(`dev${dev} -> AT+CTSDC=1,1`);
            if (target) {
              port.write(`ATD${target}\r\n`);
              console.log(`dev${dev} -> ATD${target}`);
            }
            port.write('AT+CTXD=1,1\r\n');
            console.log(`dev${dev} -> AT+CTXD=1,1`);
          } else {
            // Disable TX and hang up
            port.write('AT+CTXD=1,0\r\n');
            console.log(`dev${dev} -> AT+CTXD=1,0`);
            port.write('ATH\r\n');
            console.log(`dev${dev} -> ATH`);
          }
        }
      } else if (data.type === 'track-update') {
        wss.clients.forEach(client => {
          if (client !== ws && client.readyState === client.OPEN) {
            client.send(JSON.stringify({ type: 'track-update', data: data.data }));
          }
        });
      } else if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', data: String(e) }));
    }
  });

  ws.on('close', () => {
    if (device) {
      if (clients[device]) clients[device].delete(ws);
      if (isAudio && audioClients[device]) audioClients[device].delete(ws);
    }
  });
});

console.log('WebSocket serial server running on ws://localhost:8080');

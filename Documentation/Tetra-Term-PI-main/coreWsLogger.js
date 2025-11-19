import WebSocket from 'ws';
import mysql from 'mysql2/promise';
import fs from 'fs';
import { connectDapnet } from './dapnetGateway.js';

const WS_URL = 'wss://core01.tmo.services/ws.io';

const dbConfig = {
  user: 'root',
  database: 'tetra',
  waitForConnections: true,
  connectionLimit: 10
};

// Use the MySQL socket if it exists, otherwise fall back to TCP. The
// previous hard coded socket path caused the server to crash on systems
// where MySQL exposes only a TCP port.
const socket = '/var/run/mysqld/mysqld.sock';
if (fs.existsSync(socket)) {
  dbConfig.socketPath = socket;
} else {
  dbConfig.host = 'localhost';
  dbConfig.port = 3306;
}

const pool = mysql.createPool(dbConfig);

const configPath = new URL('./dapnetConfig.json', import.meta.url);
let dapnetConfig = {};
try {
  dapnetConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (e) {
  console.error('Failed to read dapnetConfig.json', e);
  dapnetConfig.enabled = false;
}

async function executeWithRetry(conn, sql, params = [], retries = 5) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await conn.query(sql, params);
    } catch (err) {
      if (
        ['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(err.code) &&
        attempt < retries - 1
      ) {
        await new Promise(res => setTimeout(res, 50 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
}

// Ensure required tables exist so the service can operate standalone
try {
  await pool.query(`CREATE TABLE IF NOT EXISTS web_status (
    id INT AUTO_INCREMENT PRIMARY KEY,
    site VARCHAR(255),
    state VARCHAR(255),
    \`groups\` TEXT,
    UNIQUE KEY uniq_site (site)
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS web_qrv (
    id INT AUTO_INCREMENT PRIMARY KEY,
    issi VARCHAR(255),
    callsign VARCHAR(255),
    site VARCHAR(255),
    \`groups\` TEXT,
    UNIQUE KEY uniq_issi (issi)
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS web_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    site VARCHAR(255),
    module VARCHAR(255),
    message TEXT,
    timestamp VARCHAR(255)
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS dapnet_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    timestamp DATETIME,
    message JSON
  )`);
} catch (e) {
  console.error('Failed to initialise MySQL tables', e);
}

async function saveStatus(list) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await executeWithRetry(conn, 'DELETE FROM web_status');
    const sql =
      'INSERT INTO web_status (site, state, `groups`) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE state=VALUES(state), `groups`=VALUES(`groups`)';
    const seen = new Set();
    for (const row of list) {
      if (seen.has(row.site)) continue;
      seen.add(row.site);
      await executeWithRetry(conn, sql, [row.site, row.state, row.groups]);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function saveQrv(list) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await executeWithRetry(conn, 'DELETE FROM web_qrv');
    const sql =
      'INSERT INTO web_qrv (issi, callsign, site, `groups`) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE callsign=VALUES(callsign), site=VALUES(site), `groups`=VALUES(`groups`)';

    // Deduplicate by ISSI while preferring entries with a callsign
    const rowsByIssi = new Map();
    for (const row of list) {
      const existing = rowsByIssi.get(row.issi);
      if (!existing || (!existing.callsign && row.callsign)) {
        rowsByIssi.set(row.issi, row);
      }
    }

    for (const row of rowsByIssi.values()) {
      await executeWithRetry(conn, sql, [row.issi, row.callsign, row.site, row.groups]);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

let statusQueue = Promise.resolve();
function queueStatus(list) {
  statusQueue = statusQueue
    .then(() => saveStatus(list))
    .catch(err => {
      console.error(err);
    });
  return statusQueue;
}

let qrvQueue = Promise.resolve();
function queueQrv(list) {
  qrvQueue = qrvQueue
    .then(() => saveQrv(list))
    .catch(err => {
      console.error(err);
    });
  return qrvQueue;
}

function normalizeTimestamp(ts) {
  if (ts === undefined || ts === null) {
    return new Date();
  }
  if (typeof ts === 'number') {
    if (ts < 1e12) ts *= 1000;
    return new Date(ts);
  }
  if (typeof ts === 'string') {
    if (/^\d+$/.test(ts)) {
      let num = parseInt(ts, 10);
      if (num < 1e12) num *= 1000;
      return new Date(num);
    }
    return new Date(ts);
  }
  if (ts instanceof Date) {
    return ts;
  }
  return new Date();
}

async function insertLog(entry) {
  const sql =
    'INSERT INTO web_logs (site, module, message, timestamp) SELECT ?, ?, ?, ? FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM web_logs WHERE site = ? AND module = ? AND message = ? AND timestamp = ?)';
  const params = [
    entry.site,
    entry.module,
    entry.message,
    entry.timestamp,
    entry.site,
    entry.module,
    entry.message,
    entry.timestamp
  ];
  await executeWithRetry(pool, sql, params);
}

function handleMessage(data) {
  let msg;
  try {
    msg = JSON.parse(data.toString());
  } catch {
    return;
  }

  const type = msg.type || '';

  if (type === 'status' || type === 'web_status' || type === 'statusList') {
    let obj = msg.message || msg.data || msg.payload || msg.msg;
    if (typeof obj === 'string') {
      try {
        obj = JSON.parse(obj);
      } catch {
        return;
      }
    }
    if (typeof obj !== 'object' || obj === null) return;
    const toArray = value => {
      if (Array.isArray(value)) return value;
      if (!value) return [];
      if (typeof value === 'string') return [value];
      if (typeof value === 'object') return Object.keys(value);
      return [];
    };
    const list = Object.keys(obj).map(site => {
      const val = obj[site] || {};
      const groups = [
        ...toArray(val.calls_out),
        ...toArray(val.calls_in),
        ...toArray(val.calls_ignore)
      ].join(' ');
      return { site, state: val.ws_state || '', groups };
    });
    queueStatus(list);
  } else if (type === 'qrv' || type === 'qrvUsers' || type === 'qrv_users' || type === 'web_qrv') {
    let obj = msg.message || msg.data || msg.payload || msg.msg;
    if (typeof obj === 'string') {
      try {
        obj = JSON.parse(obj);
      } catch {
        return;
      }
    }
    let list = [];
    if (Array.isArray(obj)) {
      list = obj.map(val => ({
        issi: val.issi || '',
        callsign: val.callsign || '',
        site: val.site || '',
        groups: Array.isArray(val.groups) ? val.groups.join(' ') : (val.groups || '')
      }));
    } else {
      list = Object.entries(obj || {}).map(([issi, val]) => ({
        issi,
        callsign: val.callsign || '',
        site: val.site || '',
        groups: Array.isArray(val.groups) ? val.groups.join(' ') : (val.groups || '')
      }));
    }
    queueQrv(list);
  } else if (msg.type === 'logging') {
    const entry = {
      site: msg.origin || '',
      module: msg.module || '',
      message:
        typeof msg.message === 'string'
          ? msg.message
          : JSON.stringify(msg.message || {}),
      timestamp: normalizeTimestamp(msg.timestamp)
    };
    insertLog(entry).catch(console.error);
  }
}

function connect() {
  const ws = new WebSocket(WS_URL);
  let qrvTimer;
  let statusTimer;

  function request(type) {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type }));
    }
  }

  ws.on('open', () => {
    console.log('Connected to', WS_URL);
    const requestQrv = () => {
      ['qrv', 'qrvUsers', 'qrv_users', 'web_qrv'].forEach(request);
    };
    const requestStatus = () => {
      ['status', 'web_status', 'statusList'].forEach(request);
    };
    requestStatus();
    requestQrv();
    qrvTimer = setInterval(requestQrv, 60000);
    statusTimer = setInterval(requestStatus, 60000);
  });
  ws.on('message', handleMessage);
  ws.on('close', () => {
    console.log('WebSocket closed, reconnecting in 5s');
    clearInterval(qrvTimer);
    clearInterval(statusTimer);
    setTimeout(connect, 5000);
  });
  ws.on('error', err => {
    console.error('WebSocket error', err);
    ws.close();
  });
}

connect();

async function insertDapnetMessage(msg) {
  const sql = 'INSERT INTO dapnet_messages (timestamp, message) VALUES (?, ?)';
  await executeWithRetry(pool, sql, [new Date(), JSON.stringify(msg)]);
}

function startDapnet() {
  const { call, authKey, host } = dapnetConfig;
  if (!call || !authKey) {
    console.error('DAPNET credentials missing in dapnetConfig.json');
    return;
  }
  connectDapnet(
    { call, authKey, host },
    msg => insertDapnetMessage(msg).catch(console.error),
    () => {
      console.log('DAPNET disconnected, reconnecting in 5s');
      setTimeout(startDapnet, 5000);
    }
  ).catch(err => {
    console.error('DAPNET connection error', err);
    setTimeout(startDapnet, 5000);
  });
}

if (dapnetConfig.enabled !== false) {
  startDapnet();
} else {
  console.log('DAPNET disabled via configuration.');
}

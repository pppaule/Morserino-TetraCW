import net from 'net';

const BACKOFF = [2000, 4000, 8000, 10000, 20000, 60000, 120000, 240000, 480000, 600000];

let socket = null;
let buffer = '';
let failCount = 0;

function cleanup() {
  if (socket) {
    socket.destroy();
    socket = null;
  }
  buffer = '';
}

export function connectDapnet(
  { call, authKey, host = 'dapnet.afu.rwth-aachen.de', port = 43434 },
  onMessage,
  onDisconnect,
  { onSchedule, onLoginFailed } = {}
) {
  if (socket) return Promise.resolve();

  return new Promise((resolve, reject) => {
    let connected = false;
    socket = net.createConnection({ host, port }, () => {
      socket.setKeepAlive(true);
      const lowerCall = call.toLowerCase();
      const login = `[TetraTMOGateway v1.0 ${lowerCall} ${authKey}]\r\n`;
      socket.write(login);
    });

    socket.on('data', data => {
      if (!connected) {
        connected = true;
        resolve();
      }
      buffer += data.toString();
      let idx;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx).replace(/\r$/, '');
        buffer = buffer.slice(idx + 1);
        handleLine(line);
      }
    });

    socket.on('error', err => {
      cleanup();
      if (!connected) reject(err);
      else onDisconnect && onDisconnect(err);
    });

    socket.on('close', () => {
      const wasConnected = connected;
      cleanup();
      if (!wasConnected) reject(new Error('DAPNET connection closed'));
      else onDisconnect && onDisconnect();
    });

    function handleLine(line) {
      if (!line || line === 'PONG') return;
      const first = line[0];
      if (first === '#') {
        const parts = line.slice(1).split(':');
        if (parts.length >= 5) {
          const [idHex, type, , addrHex, func, ...msgParts] = parts;
          const ackId = ((parseInt(idHex, 16) + 1) & 0xff)
            .toString(16)
            .toUpperCase()
            .padStart(2, '0');
          socket.write(`#${ackId} +\r\n`);
          onMessage &&
            onMessage({
              id: parseInt(idHex, 16),
              type: parseInt(type, 10),
              address: parseInt(addrHex, 16),
              func: parseInt(func, 10),
              text: msgParts.join(':'),
            });
        } else {
          socket.write('#00 -\r\n');
          onMessage && onMessage({ raw: line });
        }
      } else if (first === '2') {
        socket.write(line.replace(/\n?$/, ':0000\r\n'));
        socket.write('+\r\n');
      } else if (first === '3') {
        socket.write('+\r\n');
      } else if (first === '4') {
        const scheduleStr = line.slice(2);
        const schedule = new Array(16).fill(false);
        for (const c of scheduleStr) {
          const idx = parseInt(c, 16);
          if (!Number.isNaN(idx) && idx >= 0 && idx < 16) schedule[idx] = true;
        }
        onSchedule && onSchedule(schedule);
        socket.write('+\r\n');
      } else if (first === '7') {
        const reason = line.slice(2);
        const delay = BACKOFF[Math.min(failCount, BACKOFF.length - 1)];
        onLoginFailed && onLoginFailed(reason, delay);
        if (failCount < BACKOFF.length - 1) failCount++;
        socket.write('+\r\n');
      } else {
        socket.write('-\r\n');
        onMessage && onMessage({ raw: line });
      }
    }
  });
}

export function disconnectDapnet() {
  if (socket) {
    socket.end();
  }
  cleanup();
}


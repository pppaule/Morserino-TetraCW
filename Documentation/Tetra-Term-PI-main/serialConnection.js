import { print } from './utils.js';
import { handleData } from './parsing.js';
import { logCommand } from './db.js';

export default class SerialConnection {
  constructor(device) {
    this.device = device;
    this.socket = null;
    this.pendingTime = null;
    this.shouldReconnect = true;
    this.reconnectAttempts = 0;
    this.heartbeatInterval = null;
    this.reconnectTimer = null;
  }

  connect(onOpen) {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    this.socket = new WebSocket(`${protocol}://${location.host}/ws`);
    this.registerEvents(onOpen);
  }

  registerEvents(onOpen) {
    const socket = this.socket;
    socket.addEventListener('open', () => {
      this.reconnectAttempts = 0;
      socket.send(JSON.stringify({ type: 'register', device: this.device }));
      print(`✅ Verbindung ${this.device} hergestellt`, this.device);
      this.startHeartbeat();
      if (onOpen) onOpen();
    });

    socket.addEventListener('message', evt => {
      try {
        const data = JSON.parse(evt.data);
        if (data.device && data.device !== this.device) return;
        if (data.type === 'data') {
          if (this.pendingTime) {
            const diff = Date.now() - this.pendingTime;
            this.pendingTime = null;
            print(`⏱️ Antwortzeit ${this.device}: ${diff} ms`, this.device);
          }
          handleData(data.data, this.device);
        } else if (data.type === 'error') {
          print('❌ ' + data.data, this.device);
        } else if (data.type === 'log') {
          print(data.data, data.device || this.device);
        } else if (data.type === 'pong') {
          // heartbeat response
        }
      } catch (e) {
        console.error('WS parse error', e);
      }
    });

    socket.addEventListener('error', () => {
      print(`❌ Verbindung ${this.device} fehlgeschlagen`, this.device);
    });

    socket.addEventListener('close', () => {
      this.stopHeartbeat();
      print(`❌ Verbindung ${this.device} verloren`, this.device);
      if (this.shouldReconnect) {
        const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30000);
        this.reconnectAttempts++;
        this.reconnectTimer = setTimeout(() => this.connect(onOpen), delay);
      }
    });
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  disconnect() {
    this.shouldReconnect = false;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.close();
    }
  }

  sendCommand(cmd) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    print('➡️ ' + cmd, this.device);
    logCommand(cmd);
    this.pendingTime = Date.now();
    this.socket.send(JSON.stringify({ type: 'command', device: this.device, data: cmd }));
    return true;
  }
}


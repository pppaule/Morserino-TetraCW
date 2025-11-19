import { connectSerial, sendCommand, enableAllTnp1Profiles, enableTnp1Profile, defaultInitCommands, runInitialSetup } from './serial.js';
import { sendSds, requestGps, sendLipRequest, sendLongLipRequest, sendLrrpRequest, sendSdsRaw, setAckType, sendTextSds } from './sds.js';
import { generateButtons } from './commands.js';
import { map, initMap, setHouseLabel, addStaticMarker, loadMarkers, setIssiIconType, setCurrentTrack, loadTrackLines, clearTrack, getTracksData, loadSiteMarkers, addTrackPoint, exportTracks, addGeofence, calculateRoute, enableOfflineMode, startTrackRecording, stopTrackRecording, exportTrackToGPX, fetchElevationProfile, addFavorite, removeFavorite, loadFavoritesFromStorage, recordTrackPoint, setupSearch, cacheCurrentTiles } from "./map.js";
import { initMarkersDb, getMarkers, addMarker } from "./markersDb.js";
import { initTracksDb, getTracks as getSavedTracks, saveTrack, deleteTrackDb, clearTracks } from './tracksDb.js';
import { initDb, clearDb, getContacts, clearStore, getStoreEntries, API_BASE } from './db.js';
import { initRssiChart } from './rssiChart.js';
import { initContactsViewer } from './contactsViewer.js';
import { print, setIssiLookup } from './utils.js';
import { initTalkGroupDisplay } from './tgDisplay.js';
import { initWebParser } from './webParser.js';
import { initLogViewer, loadLogs } from './logViewer.js';
import { initProfiles, getProfiles, saveProfile, deleteProfile, runProfile } from './profiles.js';
import { initSdsMappings, getSdsMappings, addSdsMapping, deleteSdsMapping, updateSdsMapping } from './sdsMappings.js';
import { initDapnetMappings, getDapnetMappings, addDapnetMapping, deleteDapnetMapping, updateDapnetMapping } from './dapnetMappings.js';

const intervalHandles = { 1: {}, 2: {} };
const currentMarkerType = { 1: 'man', 2: 'man' };
let currentTrackId = null;
let trackSocket = null;
let lastDapnetId = 0;
let editingProfile = null;
let editingSdsIndex = null;
let editingDapnetIndex = null;

function renderIntervalList(device = 1) {
  const container = document.getElementById(device === 1 ? 'intervalList' : 'intervalList2');
  if (!container) return;
  const frag = document.createDocumentFragment();
  Object.keys(intervalHandles[device]).forEach(issi => {
    const item = document.createElement('div');
    item.className = 'interval-item';
    const span = document.createElement('span');
    span.textContent = issi;
    const btn = document.createElement('button');
    btn.textContent = 'X';
    btn.onclick = () => removeInterval(issi, device);
    item.appendChild(span);
    item.appendChild(btn);
    frag.appendChild(item);
  });
  container.innerHTML = '';
  container.appendChild(frag);
}

function startInterval(device = 1) {
  const suffix = device === 1 ? '' : '2';
  const issi = document.getElementById(`gpsIssi${suffix}`).value.trim();
  if (!issi) return print('⚠️ ISSI fehlt', device);
  if (intervalHandles[device][issi]) return print(`⚠️ ISSI ${issi} bereits im Intervall`, device);
  setIssiIconType(issi, currentMarkerType[device]);
  const secsEl = document.getElementById(device === 1 ? 'intervalSeconds' : 'intervalSeconds2');
  const secs = parseInt(secsEl && secsEl.value, 10) || 30;
  sendSdsRaw(0, issi, device);
  intervalHandles[device][issi] = setInterval(() => sendSdsRaw(0, issi, device), secs * 1000);
  renderIntervalList(device);
  print(`⏲️ Starte Intervalabfrage für ${issi}`, device);
}

function removeInterval(issi, device = 1) {
  const handle = intervalHandles[device][issi];
  if (handle) {
    clearInterval(handle);
    delete intervalHandles[device][issi];
    renderIntervalList(device);
    print(`🛑 Intervalabfrage für ${issi} gestoppt`, device);
  }
}

function enableDetailsDrag(container) {
  if (!container) return;
  container.querySelectorAll(':scope > details > summary').forEach(s => s.setAttribute('draggable', 'true'));
  let dragged = null;
  container.addEventListener('dragstart', e => {
    const summary = e.target.closest('summary');
    if (!summary || summary.parentNode.parentNode !== container) return;
    dragged = summary.parentNode;
    dragged.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  container.addEventListener('dragover', e => {
    e.preventDefault();
    if (!dragged) return;
    const after = getDragAfterElement(container, e.clientY);
    if (!after) container.appendChild(dragged);
    else container.insertBefore(dragged, after);
  });
  container.addEventListener('dragend', () => {
    if (dragged) dragged.classList.remove('dragging');
    dragged = null;
  });
}

function renderProfiles() {
  const list = document.getElementById('profilesList');
  if (!list) return;
  list.innerHTML = '';
  const profiles = getProfiles();
  Object.entries(profiles).forEach(([name, cmds]) => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '0.5em';
    const run1 = document.createElement('button');
    run1.textContent = `${name} ▶️1`;
    run1.onclick = () => runProfile(name, sendCommand, 1);
    const run2 = document.createElement('button');
    run2.textContent = `${name} ▶️2`;
    run2.onclick = () => runProfile(name, sendCommand, 2);
    const edit = document.createElement('button');
    edit.textContent = '✏️';
    edit.onclick = () => {
      const nameEl = document.getElementById('profileName');
      const cmdEl = document.getElementById('profileCommands');
      if (nameEl) nameEl.value = name;
      if (cmdEl) cmdEl.value = (cmds || []).join('\n');
      editingProfile = name;
      const saveBtn = document.getElementById('saveProfile');
      if (saveBtn) saveBtn.textContent = 'Profil aktualisieren';
    };
    const del = document.createElement('button');
    del.textContent = '🗑️';
    del.onclick = async () => { await deleteProfile(name); renderProfiles(); };
    row.appendChild(run1);
    row.appendChild(run2);
    row.appendChild(edit);
    row.appendChild(del);
    list.appendChild(row);
  });
  updateMappingProfiles();
}

function initProfileUi() {
  const saveBtn = document.getElementById('saveProfile');
  if (saveBtn) {
    saveBtn.onclick = async () => {
      const nameEl = document.getElementById('profileName');
      const cmdEl = document.getElementById('profileCommands');
      const name = nameEl.value.trim();
      const cmds = cmdEl.value.split(/\n/).map(s => s.trim()).filter(Boolean);
      if (!name || !cmds.length) return;
      if (editingProfile && editingProfile !== name) await deleteProfile(editingProfile);
      await saveProfile(name, cmds);
      editingProfile = null;
      saveBtn.textContent = 'Profil speichern';
      nameEl.value = '';
      cmdEl.value = '';
      renderProfiles();
    };
  }
  renderProfiles();
}

function initTrackSync() {
  try {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    trackSocket = new WebSocket(`${protocol}://${location.host}/ws`);
    trackSocket.onmessage = e => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.type === 'track-update') {
        const { id, lat, lon } = msg.data || {};
        if (id != null && lat != null && lon != null) addTrackPoint(id, lat, lon);
      }
    };
  } catch (e) {}
  document.addEventListener('trackChange', e => {
    if (!trackSocket || trackSocket.readyState !== WebSocket.OPEN) return;
    const { id, points } = e.detail || {};
    if (id == null || !points.length) return;
    const [lat, lon] = points[points.length - 1];
    trackSocket.send(JSON.stringify({ type: 'track-update', data: { id, lat, lon } }));
  });
}

function getDragAfterElement(container, y) {
  const elements = [...container.querySelectorAll(':scope > details:not(.dragging)')];
  return elements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset, element: child };
    }
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
}

function setupDeviceControls(device) {
  const suffix = device === 1 ? '' : '2';
  const resetBtn = document.getElementById(`reset${suffix}`);
  if (resetBtn) resetBtn.onclick = () => sendCommand('ATZ', device);
  const initBtn = document.getElementById(`init${suffix}`);
  if (initBtn) initBtn.onclick = () => {
    const initArea = document.getElementById(device === 1 ? 'initCommands' : 'initCommands2');
    const cmds = (initArea && initArea.value || '').split(/\n/).map(l => l.trim()).filter(Boolean);
    runInitialSetup(cmds, device);
  };
  const sendSdsBtn = document.getElementById(`sendSds${suffix}`);
  if (sendSdsBtn) sendSdsBtn.onclick = () => sendSds(device);
  const reqGpsBtn = document.getElementById(`requestGps${suffix}`);
  if (reqGpsBtn) reqGpsBtn.onclick = () => {
    const issi = document.getElementById(`gpsIssi${suffix}`).value.trim();
    if (!issi) return print('⚠️ ISSI fehlt', device);
    setIssiIconType(issi, currentMarkerType[device]);
    requestGps(device);
  };
  const startBtn = document.getElementById(`startInterval${suffix}`);
  if (startBtn) startBtn.onclick = () => startInterval(device);
  const lipBtn = document.getElementById(`requestLip${suffix}`);
  if (lipBtn) lipBtn.onclick = () => {
    const issi = document.getElementById(`gpsIssi${suffix}`).value.trim();
    if (issi) sendLipRequest(issi, device);
  };
  const longLipBtn = document.getElementById(`requestLongLip${suffix}`);
  if (longLipBtn) longLipBtn.onclick = () => {
    const issi = document.getElementById(`gpsIssi${suffix}`).value.trim();
    if (issi) sendLongLipRequest(issi, device);
  };
  const lrrpBtn = document.getElementById(`requestLrrp${suffix}`);
  if (lrrpBtn) lrrpBtn.onclick = () => {
    const issi = document.getElementById(`gpsIssi${suffix}`).value.trim();
    if (issi) sendLrrpRequest(issi, device);
  };
  const sendCustomBtn = document.getElementById(`sendCustom${suffix}`);
  if (sendCustomBtn) sendCustomBtn.onclick = () => {
    const val = document.getElementById(`customCommand${suffix}`).value;
    if (val) sendCommand(val, device);
  };
  const ackSel = document.getElementById(`ackType${suffix}`);
  if (ackSel) {
    setAckType(ackSel.value, device);
    ackSel.onchange = () => setAckType(ackSel.value, device);
  }
  const enableBtn = document.getElementById(`enableTnp1${suffix}`);
  if (enableBtn) enableBtn.onclick = () => enableAllTnp1Profiles(device);
  const select = document.getElementById(`tnp1ProfileSelect${suffix}`);
  if (select) {
    for (let i = 0; i <= 15; i++) {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = i;
      select.appendChild(opt);
    }
    const singleBtn = document.getElementById(`enableTnp1Single${suffix}`);
    if (singleBtn) singleBtn.onclick = () => {
      const profile = select.value;
      enableTnp1Profile(profile, device);
    };
  }
}

const audioSockets = {};
const micStreams = {};
const playContexts = {};
const playGainNodes = {};
const audioElements = {};
const volumes = { 1: 1, 2: 1 };
const muteStates = { 1: false, 2: false };
const audioEnabled = { 1: false, 2: false };
const noiseFilterEnabled = { 1: true, 2: true };
const noiseGateThreshold = { 1: 0.02, 2: 0.02 };
const squelchEnabled = { 1: true, 2: true };
const squelchThreshold = { 1: 0.02, 2: 0.02 };

function getAudioSocket(device) {
  if (!audioEnabled[device]) return null;
  const existing = audioSockets[device];
  if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
    return existing;
  }
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${protocol}://${location.host}/ws`);
  ws.onopen = () => ws.send(JSON.stringify({ type: 'audio-register', device }));
  ws.onmessage = e => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    if (msg.type === 'audio-chunk' && msg.device === device) {
      playIncomingAudio(device, msg.data);
    }
  };
  ws.onclose = () => {
    if (audioSockets[device] === ws) {
      delete audioSockets[device];
      if (audioEnabled[device]) setTimeout(() => getAudioSocket(device), 1000);
    }
  };
  audioSockets[device] = ws;
  return ws;
}

async function initPlayback(device) {
  if (playContexts[device]) return;
  const ctx = new AudioContext({ sampleRate: 8000 });
  await ctx.resume();
  let destination = ctx.destination;
  if (navigator.mediaDevices?.selectAudioOutput && typeof HTMLAudioElement !== 'undefined' && typeof HTMLAudioElement.prototype.setSinkId === 'function') {
    try {
      const out = await navigator.mediaDevices.selectAudioOutput();
      const el = new Audio();
      await el.setSinkId(out.deviceId);
      const dest = ctx.createMediaStreamDestination();
      el.srcObject = dest.stream;
      await el.play().catch(() => {});
      destination = dest;
      audioElements[device] = el;
    } catch (err) {
      console.warn('Audio output selection failed', err);
    }
  }
  const gain = ctx.createGain();
  gain.gain.value = muteStates[device] ? 0 : volumes[device];
  gain.connect(destination);
  playGainNodes[device] = gain;
  playContexts[device] = ctx;
}

async function toggleAudio(device) {
  const suffix = device === 1 ? '' : '2';
  audioEnabled[device] = !audioEnabled[device];
  const btn = document.getElementById(`audio${suffix}`);
  const muteBtn = document.getElementById(`mute${suffix}`);
  const vol = document.getElementById(`volume${suffix}`);
  const noiseBtn = document.getElementById(`noiseFilter${suffix}`);
  const noiseLevel = document.getElementById(`noiseLevel${suffix}`);
  const squelchBtn = document.getElementById(`squelch${suffix}`);
  const squelchLevel = document.getElementById(`squelchLevel${suffix}`);
  if (audioEnabled[device]) {
    if (btn) btn.textContent = '🔇 Disable Audio';
    if (muteBtn) muteBtn.disabled = false;
    if (vol) vol.disabled = false;
    if (noiseBtn) noiseBtn.disabled = false;
    if (noiseLevel) noiseLevel.disabled = false;
    if (squelchBtn) squelchBtn.disabled = false;
    if (squelchLevel) squelchLevel.disabled = false;
    try {
      await initPlayback(device);
      getAudioSocket(device);
    } catch (err) {
      console.error('Audio init failed', err);
      audioEnabled[device] = false;
      if (btn) btn.textContent = '🔈 Enable Audio';
      if (muteBtn) muteBtn.disabled = true;
      if (vol) vol.disabled = true;
      if (noiseBtn) noiseBtn.disabled = true;
      if (noiseLevel) noiseLevel.disabled = true;
      if (squelchBtn) squelchBtn.disabled = true;
      if (squelchLevel) squelchLevel.disabled = true;
    }
  } else {
    if (btn) btn.textContent = '🔈 Enable Audio';
    if (muteBtn) muteBtn.disabled = true;
    if (vol) vol.disabled = true;
    if (noiseBtn) noiseBtn.disabled = true;
    if (noiseLevel) noiseLevel.disabled = true;
    if (squelchBtn) squelchBtn.disabled = true;
    if (squelchLevel) squelchLevel.disabled = true;
    const ws = audioSockets[device];
    if (ws) {
      ws.close();
      delete audioSockets[device];
    }
    const gain = playGainNodes[device];
    if (gain) {
      gain.disconnect();
      delete playGainNodes[device];
    }
    const ctx = playContexts[device];
    if (ctx) {
      ctx.close();
      delete playContexts[device];
    }
    const el = audioElements[device];
    if (el) {
      el.srcObject = null;
      el.pause();
      delete audioElements[device];
    }
  }
}

function playIncomingAudio(device, b64) {
  const ctx = playContexts[device];
  const gain = playGainNodes[device];
  if (!ctx || !gain) return;
  if (ctx.state === 'suspended') {
    try { ctx.resume(); } catch {}
  }
  const buf = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const audioBuffer = ctx.createBuffer(1, buf.length / 2, 8000);
  const data = audioBuffer.getChannelData(0);
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const lo = buf[i * 2];
    const hi = buf[i * 2 + 1];
    let val = (hi << 8) | lo;
    if (val >= 0x8000) val -= 0x10000;
    const sample = val / 0x8000;
    data[i] = sample;
    sum += sample * sample;
  }
  const rms = Math.sqrt(sum / data.length);
  if (squelchEnabled[device] && rms < squelchThreshold[device]) return;
  const src = ctx.createBufferSource();
  src.buffer = audioBuffer;
  src.connect(gain);
  src.start();
}

function getMicStream() {
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    return navigator.mediaDevices.getUserMedia({ audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: true } });
  }
  const legacy = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
  if (legacy) {
    return new Promise((resolve, reject) => legacy.call(navigator, { audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: true } }, resolve, reject));
  }
  return Promise.reject(new Error('getUserMedia not supported'));
}

async function startPtt(device) {
  const ws = getAudioSocket(device);
  if (!ws) return print('⚠️ Audio disabled', device);
  print('🎙️ PTT pressed', device);
  const suffix = device === 1 ? '' : '2';
  const targetInput = document.getElementById(`destination${suffix}`);
  const target = targetInput ? targetInput.value.trim() : '';
  // Immediately notify the server so the radio goes to TX even while
  // the microphone stream is initialising. This also ensures that AT
  // commands are sent regardless of audio issues.
  ws.send(JSON.stringify({ type: 'ptt', device, state: true, target }));
  let stream;
  try {
    stream = await getMicStream();
  } catch (err) {
    print(`❌ Mic error: ${err.message || err}`, device);
    // If we already keyed up but the mic failed, unkey the device.
    ws.send(JSON.stringify({ type: 'ptt', device, state: false }));
    return;
  }
  const ctx = new AudioContext({ sampleRate: 8000 });
  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(2048, 1, 1);
  source.connect(processor);
  const silent = ctx.createGain();
  silent.gain.value = 0;
  processor.connect(silent);
  silent.connect(ctx.destination);
  processor.onaudioprocess = e => {
    const input = e.inputBuffer.getChannelData(0);
    let sum = 0;
    for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
    const rms = Math.sqrt(sum / input.length);
    const suppressed = noiseFilterEnabled[device] && rms < noiseGateThreshold[device];
    const buffer = new ArrayBuffer(input.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < input.length; i++) {
      const sample = suppressed ? 0 : Math.max(-1, Math.min(1, input[i]));
      view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    }
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    ws.send(JSON.stringify({ type: 'audio-chunk', device, data: b64 }));
  };
  micStreams[device] = { stream, ctx, processor, source, silent };
}

function stopPtt(device) {
  const rec = micStreams[device];
  if (!rec) return;
  rec.processor.disconnect();
  if (rec.silent) rec.silent.disconnect();
  rec.source.disconnect();
  rec.stream.getTracks().forEach(t => t.stop());
  rec.ctx.close();
  micStreams[device] = null;
  const ws = getAudioSocket(device);
  if (ws) ws.send(JSON.stringify({ type: 'ptt', device, state: false }));
  print('🎙️ PTT released', device);
}

function setupAudio(device) {
  const suffix = device === 1 ? '' : '2';
  const btn = document.getElementById(`ptt${suffix}`);
  if (btn) {
    const start = () => startPtt(device);
    const stop = () => stopPtt(device);
    btn.addEventListener('mousedown', start);
    btn.addEventListener('touchstart', start);
    ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach(ev => btn.addEventListener(ev, stop));
  }
  const audioBtn = document.getElementById(`audio${suffix}`);
  if (audioBtn) {
    audioBtn.onclick = () => toggleAudio(device);
    audioBtn.textContent = audioEnabled[device] ? '🔇 Disable Audio' : '🔈 Enable Audio';
  }
  const muteBtn = document.getElementById(`mute${suffix}`);
  if (muteBtn) {
    muteBtn.onclick = () => toggleMute(device);
    muteBtn.disabled = !audioEnabled[device];
  }
  const noiseBtn = document.getElementById(`noiseFilter${suffix}`);
  if (noiseBtn) {
    noiseBtn.onclick = () => toggleNoiseFilter(device);
    noiseBtn.textContent = noiseFilterEnabled[device] ? '🔕 Disable Noise Filter' : '🔔 Enable Noise Filter';
    noiseBtn.disabled = !audioEnabled[device];
  }
  const noiseLevel = document.getElementById(`noiseLevel${suffix}`);
  if (noiseLevel) {
    noiseLevel.value = noiseGateThreshold[device];
    noiseLevel.oninput = e => setNoiseLevel(device, parseFloat(e.target.value));
    noiseLevel.disabled = !audioEnabled[device];
  }
  const squelchBtn = document.getElementById(`squelch${suffix}`);
  if (squelchBtn) {
    squelchBtn.onclick = () => toggleSquelch(device);
    squelchBtn.textContent = squelchEnabled[device] ? '📢 Disable Squelch' : '📢 Enable Squelch';
    squelchBtn.disabled = !audioEnabled[device];
  }
  const squelchLevel = document.getElementById(`squelchLevel${suffix}`);
  if (squelchLevel) {
    squelchLevel.value = squelchThreshold[device];
    squelchLevel.oninput = e => setSquelchLevel(device, parseFloat(e.target.value));
    squelchLevel.disabled = !audioEnabled[device];
  }
  const vol = document.getElementById(`volume${suffix}`);
  if (vol) {
    vol.value = volumes[device];
    vol.oninput = e => setVolume(device, parseFloat(e.target.value));
    vol.disabled = !audioEnabled[device];
  }
}

function setVolume(device, value) {
  volumes[device] = value;
  const gain = playGainNodes[device];
  if (gain && !muteStates[device]) gain.gain.value = value;
}

function toggleMute(device) {
  const suffix = device === 1 ? '' : '2';
  muteStates[device] = !muteStates[device];
  const gain = playGainNodes[device];
  if (gain) gain.gain.value = muteStates[device] ? 0 : volumes[device];
  const btn = document.getElementById(`mute${suffix}`);
  if (btn) btn.textContent = muteStates[device] ? '🔊 Unmute' : '🔇 Mute';
}

function toggleNoiseFilter(device) {
  const suffix = device === 1 ? '' : '2';
  noiseFilterEnabled[device] = !noiseFilterEnabled[device];
  const btn = document.getElementById(`noiseFilter${suffix}`);
  if (btn) btn.textContent = noiseFilterEnabled[device] ? '🔕 Disable Noise Filter' : '🔔 Enable Noise Filter';
}

function setNoiseLevel(device, value) {
  noiseGateThreshold[device] = value;
}

function toggleSquelch(device) {
  const suffix = device === 1 ? '' : '2';
  squelchEnabled[device] = !squelchEnabled[device];
  const btn = document.getElementById(`squelch${suffix}`);
  if (btn) btn.textContent = squelchEnabled[device] ? '📢 Disable Squelch' : '📢 Enable Squelch';
}

function setSquelchLevel(device, value) {
  squelchThreshold[device] = value;
}

  window.onload = async () => {
    document.querySelectorAll('#mainNav button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#mainNav button').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const target = document.getElementById(btn.dataset.panel);
        if (target) target.classList.add('active');
        if (btn.dataset.panel === 'panel-map' && map) {
          setTimeout(() => {
            map.invalidateSize();
            getMarkers().then(loadMarkers);
          }, 0);
        }
      });
    });
    try {
    await initDb();
  } catch (e) {
    console.error('DB init failed', e);
  }
  try {
    await initMarkersDb();
  } catch (e) {
    console.error('Markers DB init failed', e);
  }
  try {
    await initTracksDb();
  } catch (e) {
    console.error('Tracks DB init failed', e);
  }
  try {
    await initLogViewer();
  } catch (e) {
    console.error('Log viewer init failed', e);
  }
  try {
    await initContactsViewer();
  } catch (e) {
    console.error('Contacts viewer init failed', e);
  }
  try {
    await initProfiles();
    await initSdsMappings();
    await initDapnetMappings();
  } catch (e) {
    console.error('Mappings init failed', e);
  }
  try {
    await initTalkGroupDisplay(() => getContacts(), 1);
    await initTalkGroupDisplay(() => getContacts(), 2);
  } catch (e) {
    console.error('Talk group display init failed', e);
  }
    initWebParser();
    initRssiChart(1);
    initRssiChart(2);

  const initArea1 = document.getElementById('initCommands');
  if (initArea1) initArea1.value = defaultInitCommands.join('\n');
  const initArea2 = document.getElementById('initCommands2');
  if (initArea2) initArea2.value = defaultInitCommands.join('\n');

  setupDeviceControls(1);
  setupDeviceControls(2);
  connectSerial(1);
  connectSerial(2);
  setupAudio(1);
  setupAudio(2);

  document.getElementById('clearDb').onclick = async () => {
    const storeSelect = document.getElementById('dbStore');
    const store = storeSelect ? storeSelect.value : 'all';
    if (store === 'all') {
      await clearDb();
      await clearTracks();
    } else {
      if (store === 'tracks') {
        await clearTracks();
      } else {
        await clearStore(store);
      }
    }
    await loadLogs();
  };
  const clearLogBtn1 = document.getElementById('clearLog1');
  if (clearLogBtn1) clearLogBtn1.onclick = () => {
    const out = document.getElementById('output1');
    if (out) out.value = '';
  };
  const clearLogBtn2 = document.getElementById('clearLog2');
  if (clearLogBtn2) clearLogBtn2.onclick = () => {
    const out = document.getElementById('output2');
    if (out) out.value = '';
  };
  const labelInput = document.getElementById('houseLabel');
  if (labelInput) {
    setHouseLabel(labelInput.value, 1);
    labelInput.onchange = () => setHouseLabel(labelInput.value, 1);
  }
  const labelInput2 = document.getElementById('houseLabel2');
  if (labelInput2) {
    setHouseLabel(labelInput2.value, 2);
    labelInput2.onchange = () => setHouseLabel(labelInput2.value, 2);
  }
  const markerSel1 = document.getElementById('markerSelect');
  if (markerSel1) {
    currentMarkerType[1] = markerSel1.value;
    markerSel1.onchange = () => { currentMarkerType[1] = markerSel1.value; };
  }
  const markerSel2 = document.getElementById('markerSelect2');
  if (markerSel2) {
    currentMarkerType[2] = markerSel2.value;
    markerSel2.onchange = () => { currentMarkerType[2] = markerSel2.value; };
  }
  const trackSel1 = document.getElementById('trackSelect');
  const trackSel2 = document.getElementById('trackSelect2');
  const trackSelects = [trackSel1, trackSel2].filter(Boolean);
  if (trackSelects.length) {
    for (let i = 1; i <= 10; i++) {
      trackSelects.forEach(sel => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = i;
        sel.appendChild(opt);
      });
    }
    const updateTrack = val => {
      currentTrackId = isNaN(val) ? null : val;
      setCurrentTrack(currentTrackId);
      trackSelects.forEach(sel => {
        sel.value = currentTrackId == null ? '' : String(currentTrackId);
      });
    };
    trackSelects.forEach(sel => {
      sel.onchange = () => {
        const v = parseInt(sel.value, 10);
        updateTrack(v);
      };
    });
    const initial = parseInt(trackSelects[0].value, 10);
    updateTrack(initial);
  }
  const clearTrackBtns = [document.getElementById('clearTrack'), document.getElementById('clearTrack2')];
  clearTrackBtns.forEach(btn => {
    if (btn) btn.onclick = () => {
      if (currentTrackId != null) {
        clearTrack(currentTrackId);
        deleteTrackDb(currentTrackId);
      }
    };
  });
  const darkToggle = document.getElementById('darkModeToggle');
  if (darkToggle) {
    const applyDark = val => {
      document.body.classList.toggle('dark', val);
      localStorage.setItem('darkMode', val ? '1' : '0');
    };
    const current = localStorage.getItem('darkMode') === '1';
    applyDark(current);
    darkToggle.checked = current;
    darkToggle.onchange = () => applyDark(darkToggle.checked);
  }
  const lookupToggle = document.getElementById('issiLookup');
  if (lookupToggle) {
    const applyLookup = val => {
      setIssiLookup(val);
      localStorage.setItem('issiLookup', val ? '1' : '0');
    };
    const currentLookup = localStorage.getItem('issiLookup') === '1';
    applyLookup(currentLookup);
    lookupToggle.checked = currentLookup;
    lookupToggle.onchange = () => applyLookup(lookupToggle.checked);
  }
  generateButtons(sendCommand, 1);
  generateButtons(sendCommand, 2);
  initMap();
  loadFavoritesFromStorage();
  setupSearch();
  window.addGeofence = addGeofence;
  window.calculateRoute = calculateRoute;
  window.enableOfflineMode = enableOfflineMode;
  window.startTrackRecording = startTrackRecording;
  window.stopTrackRecording = stopTrackRecording;
  window.exportTrackToGPX = exportTrackToGPX;
  window.fetchElevationProfile = fetchElevationProfile;
  window.addFavorite = addFavorite;
  window.removeFavorite = removeFavorite;
  window.recordTrackPoint = recordTrackPoint;
  document.addEventListener('geofenceEnter', e => {
    print(`🚧 ISSI ${e.detail.issi} entered geofence`, 1);
  });
  document.addEventListener('geofenceExit', e => {
    print(`✅ ISSI ${e.detail.issi} left geofence`, 1);
  });
  const hamnetSites = await fetch('hamnetMarkers.json')
    .then(r => r.json())
    .catch(() => []);
  loadSiteMarkers(hamnetSites);
  const storedMarkers = await getMarkers();
  loadMarkers(storedMarkers);
  const storedTracks = await getSavedTracks();
  loadTrackLines(storedTracks);
  if (map) {
    map.on('click', async e => {
    const desc = prompt('Beschreibung für Marker?');
    if (desc !== null) {
      const height = parseFloat(prompt('Höhe des Markers in m?') || '0');
      const id = await addMarker({ lat: e.latlng.lat, lon: e.latlng.lng, description: desc, height });
      if (id !== null) addStaticMarker({ id, lat: e.latlng.lat, lon: e.latlng.lng, description: desc, height });
    }
  });
  }
  const cacheBtn = document.getElementById('cacheTilesBtn');
  if (cacheBtn) cacheBtn.onclick = cacheCurrentTiles;
  const geoBtn = document.getElementById('addGeofenceBtn');
  if (geoBtn) {
    geoBtn.onclick = () => {
      const lat = parseFloat(document.getElementById('geoLat').value);
      const lon = parseFloat(document.getElementById('geoLon').value);
      const radius = parseFloat(document.getElementById('geoRadius').value);
      if (!isNaN(lat) && !isNaN(lon) && !isNaN(radius)) {
        addGeofence(lat, lon, radius);
      }
    };
  }
  const routeBtn = document.getElementById('calcRouteBtn');
  if (routeBtn) {
    routeBtn.onclick = () => {
      const slat = parseFloat(document.getElementById('routeStartLat').value);
      const slon = parseFloat(document.getElementById('routeStartLon').value);
      const elat = parseFloat(document.getElementById('routeEndLat').value);
      const elon = parseFloat(document.getElementById('routeEndLon').value);
      if (![slat, slon, elat, elon].some(isNaN)) {
        calculateRoute([slat, slon], [elat, elon]);
      }
    };
  }
  document.addEventListener('markersChange', async () => {
    const list = await getMarkers();
    loadMarkers(list);
  });
  document.addEventListener('trackChange', e => {
    const { id, points } = e.detail || {};
    if (id != null) saveTrack(id, points);
  });
  renderIntervalList(1);
  renderIntervalList(2);

  const exportBtn = document.getElementById('exportTracks');
  if (exportBtn) exportBtn.onclick = () => exportTracks();

  initProfileUi();
  renderSdsMappings();
  initSdsMappingUi();
  renderDapnetMappings();
  initDapnetMappingUi();
  initTrackSync();

  const dapnetDebugBtn = document.getElementById('dapnetDebug');
  if (dapnetDebugBtn) {
    dapnetDebugBtn.onclick = async () => {
      const out = document.getElementById('dapnetDebugOutput');
      if (!out) return;
      if (out.style.display === 'none') {
        const list = await getStoreEntries('dapnet_messages');
        out.textContent = list
          .map(item => {
            const msg = typeof item.message === 'object' ? JSON.stringify(item.message) : item.message;
            return `${item.timestamp || ''} ${msg}`;
          })
          .join('\n');
        out.style.display = 'block';
      } else {
        out.style.display = 'none';
      }
    };
  }
  loadDapnetMessages();
  setInterval(loadDapnetMessages, 10000);

  enableDetailsDrag(document.querySelector('.container'));
  enableDetailsDrag(document.getElementById('webParser'));

  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('sw.js');
    } catch (e) {
      console.error('SW registration failed', e);
    }
  }

};

function updateMappingProfiles() {
  const sel = document.getElementById('sdsProfile');
  if (!sel) return;
  const profiles = getProfiles();
  sel.innerHTML = '';
  Object.keys(profiles).forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    sel.appendChild(opt);
  });
}

function renderSdsMappings() {
  const list = document.getElementById('sdsMappingsList');
  if (!list) return;
  list.innerHTML = '';
  const mappings = getSdsMappings();
  mappings.forEach((m, idx) => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '0.5em';
    const label = m.text ? `Text "${m.text}"` : `Status ${m.status}`;
    let desc = `${label} ▶️${m.sourceDevice} → ${m.profile} ▶️${m.targetDevice}`;
    if (m.issis && m.issis.length) desc += ` [ISSI: ${m.issis.join(', ')}]`;
    row.textContent = desc;
    const edit = document.createElement('button');
    edit.textContent = '✏️';
    edit.onclick = () => {
      const statusInput = document.getElementById('sdsStatus');
      const textInput = document.getElementById('sdsText');
      const srcSel = document.getElementById('sdsSource');
      const profileSel = document.getElementById('sdsProfile');
      const tgtSel = document.getElementById('sdsTarget');
      const issiInput = document.getElementById('sdsIssis');
      if (statusInput) statusInput.value = m.status || '';
      if (textInput) textInput.value = m.text || '';
      if (srcSel) srcSel.value = m.sourceDevice || 1;
      if (profileSel) profileSel.value = m.profile || '';
      if (tgtSel) tgtSel.value = m.targetDevice || 1;
      if (issiInput) issiInput.value = (m.issis || []).join(', ');
      editingSdsIndex = idx;
      const btn = document.getElementById('addSdsMapping');
      if (btn) btn.textContent = 'Mapping aktualisieren';
    };
    const del = document.createElement('button');
    del.textContent = '🗑️';
    del.onclick = async () => { await deleteSdsMapping(idx); renderSdsMappings(); };
    row.appendChild(edit);
    row.appendChild(del);
    list.appendChild(row);
  });
}

function initSdsMappingUi() {
  const btn = document.getElementById('addSdsMapping');
  if (btn) {
    btn.onclick = async () => {
      const statusInput = document.getElementById('sdsStatus');
      const textInput = document.getElementById('sdsText');
      const srcSel = document.getElementById('sdsSource');
      const profileSel = document.getElementById('sdsProfile');
      const tgtSel = document.getElementById('sdsTarget');
      const issiInput = document.getElementById('sdsIssis');
      const status = statusInput.value.trim().toUpperCase();
      const text = textInput.value.trim();
      const profile = profileSel.value;
      if ((!status && !text) || !profile) return;
      const issis = issiInput.value.split(',').map(s => s.trim()).filter(Boolean);
      const mapping = {
        status: status || undefined,
        text: text || undefined,
        issis,
        sourceDevice: parseInt(srcSel.value, 10) || 1,
        profile,
        targetDevice: parseInt(tgtSel.value, 10) || 1
      };
      if (editingSdsIndex != null) {
        await updateSdsMapping(editingSdsIndex, mapping);
      } else {
        await addSdsMapping(mapping);
      }
      editingSdsIndex = null;
      btn.textContent = 'Mapping speichern';
      statusInput.value = '';
      textInput.value = '';
      issiInput.value = '';
      renderSdsMappings();
    };
  }
}

function renderDapnetMappings() {
  const list = document.getElementById('dapnetMappingsList');
  if (!list) return;
  list.innerHTML = '';
  const mappings = getDapnetMappings();
  mappings.forEach((m, idx) => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '0.5em';
    let desc = '';
    if (m.address != null) desc += `Addr ${m.address} `;
    if (m.func != null) desc += `Func ${m.func} `;
    if (m.text) desc += m.regex ? `/${m.text}/` : `"${m.text}"`;
    desc += ` → ${m.issis.join(', ')} ▶️${m.device || 1}`;
    row.textContent = desc.trim();
    const edit = document.createElement('button');
    edit.textContent = '✏️';
    edit.onclick = () => {
      const addrInput = document.getElementById('dapnetAddress');
      const funcInput = document.getElementById('dapnetFunc');
      const textInput = document.getElementById('dapnetText');
      const regexChk = document.getElementById('dapnetRegex');
      const devSel = document.getElementById('dapnetDevice');
      const issiInput = document.getElementById('dapnetIssis');
      if (addrInput) addrInput.value = m.address ?? '';
      if (funcInput) funcInput.value = m.func ?? '';
      if (textInput) textInput.value = m.text || '';
      if (regexChk) regexChk.checked = !!m.regex;
      if (devSel) devSel.value = m.device || 1;
      if (issiInput) issiInput.value = (m.issis || []).join(', ');
      editingDapnetIndex = idx;
      const btn = document.getElementById('addDapnetMapping');
      if (btn) btn.textContent = 'Mapping aktualisieren';
    };
    const del = document.createElement('button');
    del.textContent = '🗑️';
    del.onclick = async () => { await deleteDapnetMapping(idx); renderDapnetMappings(); };
    row.appendChild(edit);
    row.appendChild(del);
    list.appendChild(row);
  });
}

function initDapnetMappingUi() {
  const btn = document.getElementById('addDapnetMapping');
  if (!btn) return;
  btn.onclick = async () => {
    const addrInput = document.getElementById('dapnetAddress');
    const funcInput = document.getElementById('dapnetFunc');
    const textInput = document.getElementById('dapnetText');
    const regexChk = document.getElementById('dapnetRegex');
    const devSel = document.getElementById('dapnetDevice');
    const issiInput = document.getElementById('dapnetIssis');
    const address = parseInt(addrInput.value.trim(), 10);
    const func = parseInt(funcInput.value.trim(), 10);
    const text = textInput.value.trim();
    const issis = issiInput.value.split(',').map(s => s.trim()).filter(Boolean);
    if (!issis.length) return;
    const mapping = {
      address: isNaN(address) ? undefined : address,
      func: isNaN(func) ? undefined : func,
      text: text || undefined,
      regex: regexChk.checked || undefined,
      device: parseInt(devSel.value, 10) || 1,
      issis
    };
    if (editingDapnetIndex != null) {
      await updateDapnetMapping(editingDapnetIndex, mapping);
    } else {
      await addDapnetMapping(mapping);
    }
    editingDapnetIndex = null;
    btn.textContent = 'Mapping speichern';
    addrInput.value = '';
    funcInput.value = '';
    textInput.value = '';
    issiInput.value = '';
    regexChk.checked = false;
    renderDapnetMappings();
  };
}

function handleDapnetMessage(msg) {
  const mappings = getDapnetMappings();
  const text = (msg.text || '').trim();
  mappings.forEach(m => {
    if (m.address != null && m.address !== msg.address) return;
    if (m.func != null && m.func !== msg.func) return;
    if (m.text) {
      if (m.regex) {
        let r;
        try {
          r = new RegExp(m.text, 'i');
        } catch {
          return;
        }
        if (!r.test(text)) return;
      } else {
        if (!text.toLowerCase().includes(m.text.toLowerCase())) return;
      }
    }
    (m.issis || []).forEach(issi => {
      sendTextSds(issi, text, 0, m.device || 1);
    });
  });
}

async function loadDapnetMessages() {
  try {
    const list = await getStoreEntries('dapnet_messages');
    const sorted = list.slice().sort((a, b) =>
      new Date(b.timestamp || 0) - new Date(a.timestamp || 0)
    );
    renderDapnetMessages(sorted);
    const newMsgs = sorted.filter(item => item.id > lastDapnetId);
    if (newMsgs.length) {
      if (lastDapnetId !== 0) {
        newMsgs.forEach(item => handleDapnetMessage(item.message || {}));
      }
      lastDapnetId = Math.max(...newMsgs.map(m => m.id));
    } else if (lastDapnetId === 0 && list.length) {
      lastDapnetId = Math.max(...list.map(m => m.id));
    }
    const out = document.getElementById('dapnetDebugOutput');
    if (out && out.style.display !== 'none') {
      out.textContent = sorted
        .map(item => {
          const msg = typeof item.message === 'object' ? JSON.stringify(item.message) : item.message;
          return `${item.timestamp || ''} ${msg}`;
        })
        .join('\n');
    }
  } catch (e) {
    console.error('Failed to load DAPNET messages', e);
  }
}

function renderDapnetMessages(list) {
  const body = document.getElementById('dapnetTableBody');
  if (!body) return;
  const frag = document.createDocumentFragment();
  list.forEach(item => {
    const tr = document.createElement('tr');
    const ts = document.createElement('td');
    ts.textContent = item.timestamp || '';
    const msg = document.createElement('td');
    msg.textContent = typeof item.message === 'object' ? JSON.stringify(item.message) : item.message;
    tr.appendChild(ts);
    tr.appendChild(msg);
    frag.appendChild(tr);
  });
  body.innerHTML = '';
  body.appendChild(frag);
}


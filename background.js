/* RayMo — Background Service Worker (Tab Screamer Engine) */

const EMOJIS = ['🥺', '😠', '😡', '🤬'];

const LINES = [
  ['bakit mo ako iniwan?', 'miss na kita...', 'hello? nandito pa ako...', 'pansinin mo naman ako...', 'ang tagal mo na dun ha...'],
  ['EXCUSE ME??', 'ang tagal mo na!', 'NAKA-SEEN LANG AKO??', 'may iba ka na bang tab?', 'i-CLOSE mo na lang ako kung ganyan'],
  ['GRABE KA TALAGA', 'HINDI AKO OKAY', 'ANO BA PROBLEMA MO??', 'sinasabi ko sayo HA', 'LAST STRAW NA \'TO'],
  ['LULUBOG NA AKO!!', 'WALA NA FINISH NA', 'I TRUSTED YOU', 'BLOCKED AND REPORTED', 'NAGHIHINGALO NA TABS MO']
];

const state = {}; // tabId -> { lastActive, stage, audioPlaying }

// ── Offscreen Document Manager ──
async function ensureOffscreen() {
  if (chrome.offscreen && chrome.offscreen.hasDocument) {
    try {
      if (await chrome.offscreen.hasDocument()) return;
    } catch (e) {}
  }
  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Playing synthetic tab accountability alerts'
    });
    // Brief breather for the document script to initialize
    await new Promise(r => setTimeout(r, 80));
  } catch (err) {
    // Already created or in progress
  }
}

async function sendAudio(msg) {
  try {
    await ensureOffscreen();
    chrome.runtime.sendMessage(msg).catch(() => {});
  } catch (e) {}
}

// ── Settings ──
async function getSettings() {
  const d = await chrome.storage.local.get(['demoMode', 'muted']);
  // Default to Demo mode true if unconfigured
  const demo = d.demoMode !== undefined ? !!d.demoMode : true;
  return { demo, muted: !!d.muted };
}

// ── Core Tab Monitoring Loop ──
async function checkTabs() {
  const { demo, muted } = await getSettings();
  const threshold = demo ? 10_000 : 600_000;   // 10s demo / 10m normal
  const stageStep = demo ? 10_000 : 600_000;   // time per escalation stage

  let allTabs = [];
  let activeTabs = [];
  try {
    allTabs = await chrome.tabs.query({});
    activeTabs = await chrome.tabs.query({ active: true });
  } catch (e) {
    return;
  }

  const activeIds = new Set(activeTabs.map(t => t.id));
  let screamCount = 0;

  for (const tab of allTabs) {
    const id = tab.id;
    if (!state[id]) {
      state[id] = { lastActive: Date.now(), stage: -1, audioPlaying: false };
    }

    // Active tab or playing audio -> PEACEFUL & SILENT
    if (activeIds.has(id) || tab.audible) {
      if (state[id].stage >= 0) {
        chrome.tabs.sendMessage(id, { type: 'RESTORE' }).catch(() => {});
        sendAudio({ type: 'STOP_AUDIO', tabId: id });
      }
      state[id] = { lastActive: Date.now(), stage: -1, audioPlaying: false };
      continue;
    }

    const elapsed = Date.now() - state[id].lastActive;
    if (elapsed < threshold) continue;

    const newStage = Math.min(3, Math.floor((elapsed - threshold) / stageStep));
    screamCount++;

    const needsVisual = (newStage !== state[id].stage);
    const needsAudio = (!muted && (!state[id].audioPlaying || newStage !== state[id].stage));

    state[id].stage = newStage;

    if (needsVisual) {
      const lines = LINES[newStage];
      chrome.tabs.sendMessage(id, {
        type: 'SCREAM',
        emoji: EMOJIS[newStage],
        line: lines[Math.floor(Math.random() * lines.length)]
      }).catch(() => {});
    }

    if (needsAudio) {
      state[id].audioPlaying = true;
      sendAudio({ type: 'PLAY_AUDIO', tabId: id, stage: newStage });
    }
  }

  // Update badge counter
  try {
    chrome.action.setBadgeBackgroundColor({ color: '#c0392b' });
    chrome.action.setBadgeText({ text: screamCount > 0 ? String(screamCount) : '' });
  } catch (e) {}

  return screamCount;
}

// ── Event Handlers ──
chrome.tabs.onActivated.addListener(() => checkTabs());

chrome.tabs.onRemoved.addListener(tabId => {
  delete state[tabId];
  sendAudio({ type: 'STOP_AUDIO', tabId });
});

// Runtime messaging
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_STATUS') {
    const screaming = Object.values(state).filter(s => s.stage >= 0).length;
    const stages = Object.values(state).map(s => s.stage).filter(st => st >= 0);
    sendResponse({ screaming, stages, total: Object.keys(state).length });
    return false;
  }

  if (msg.type === 'FORCE_DEMO_SCREAM') {
    (async () => {
      const { muted } = await getSettings();
      const allTabs = await chrome.tabs.query({});
      const activeTabs = await chrome.tabs.query({ active: true });
      const activeIds = new Set(activeTabs.map(t => t.id));

      await ensureOffscreen();

      let stageIdx = 0;
      for (const tab of allTabs) {
        if (!activeIds.has(tab.id)) {
          const s = stageIdx % 4;
          state[tab.id] = { lastActive: Date.now() - 50_000, stage: s, audioPlaying: true };

          chrome.tabs.sendMessage(tab.id, {
            type: 'SCREAM',
            emoji: EMOJIS[s],
            line: LINES[s][0]
          }).catch(() => {});

          if (!muted) {
            sendAudio({ type: 'PLAY_AUDIO', tabId: tab.id, stage: s });
          }
          stageIdx++;
        }
      }
      checkTabs();
      sendResponse({ ok: true });
    })();
    return true; // async response
  }

  if (msg.type === 'CALM_ALL') {
    for (const id in state) {
      chrome.tabs.sendMessage(Number(id), { type: 'RESTORE' }).catch(() => {});
      state[id] = { lastActive: Date.now(), stage: -1, audioPlaying: false };
    }
    sendAudio({ type: 'STOP_ALL' });
    checkTabs();
    sendResponse({ ok: true });
    return false;
  }
});

chrome.storage.onChanged.addListener(async changes => {
  if (changes.demoMode) {
    for (const id in state) {
      if (state[id].stage >= 0) {
        chrome.tabs.sendMessage(Number(id), { type: 'RESTORE' }).catch(() => {});
      }
      state[id] = { lastActive: Date.now(), stage: -1, audioPlaying: false };
    }
    sendAudio({ type: 'STOP_ALL' });
  }

  if (changes.muted) {
    if (changes.muted.newValue) {
      sendAudio({ type: 'STOP_ALL' });
      for (const id in state) {
        if (state[id]) state[id].audioPlaying = false;
      }
    } else {
      for (const [id, s] of Object.entries(state)) {
        if (s.stage >= 0) {
          state[id].audioPlaying = true;
          sendAudio({ type: 'PLAY_AUDIO', tabId: Number(id), stage: s.stage });
        }
      }
    }
  }
  checkTabs();
});

// Periodic monitoring every 2 seconds
setInterval(checkTabs, 2000);
checkTabs();

/* RayMo — Background Service Worker (Tab Screamer Engine) */

const EMOJIS = ['🥺', '😠', '😡', '🤬'];

const LINES = [
  ['bakit mo ako iniwan?', 'miss na kita...', 'hello? nandito pa ako...', 'pansinin mo naman ako...', 'ang tagal mo na dun ha...'],
  ['EXCUSE ME??', 'ang tagal mo na!', 'NAKA-SEEN LANG AKO??', 'may iba ka na bang tab?', 'i-CLOSE mo na lang ako kung ganyan'],
  ['GRABE KA TALAGA', 'HINDI AKO OKAY', 'ANO BA PROBLEMA MO??', 'sinasabi ko sayo HA', 'LAST STRAW NA \'TO'],
  ['LULUBOG NA AKO!!', 'WALA NA FINISH NA', 'I TRUSTED YOU', 'BLOCKED AND REPORTED', 'NAGHIHINGALO NA TABS MO']
];

const state = {}; // tabId → { lastActive, stage }

// ── Offscreen document (Audio playback) ──────────────────────────────
async function ensureOffscreen() {
  if (chrome.offscreen && chrome.offscreen.hasDocument) {
    if (await chrome.offscreen.hasDocument()) return;
  }
  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Playing tab accountability screaming alerts'
    });
  } catch (err) {
    // Already exists or creation in progress
  }
}

// ── Settings helper ─────────────────────────────────────────────────
async function getSettings() {
  const d = await chrome.storage.local.get(['demoMode', 'muted']);
  return { demo: !!d.demoMode, muted: !!d.muted };
}

// ── Main check loop ─────────────────────────────────────────────────
async function checkTabs() {
  const { demo, muted } = await getSettings();
  const threshold = demo ? 10_000 : 600_000;   // 10s demo / 10m normal
  const stageStep = demo ? 10_000 : 600_000;   // time per rage level

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
    if (!state[id]) state[id] = { lastActive: Date.now(), stage: -1 };

    // Active tab or tab playing media → peaceful
    if (activeIds.has(id) || tab.audible) {
      if (state[id].stage >= 0) {
        chrome.tabs.sendMessage(id, { type: 'RESTORE' }).catch(() => {});
        sendAudio({ type: 'STOP_AUDIO', tabId: id });
      }
      state[id] = { lastActive: Date.now(), stage: -1 };
      continue;
    }

    const elapsed = Date.now() - state[id].lastActive;
    if (elapsed < threshold) continue;

    const newStage = Math.min(3, Math.floor((elapsed - threshold) / stageStep));
    screamCount++;

    if (newStage === state[id].stage) continue;
    state[id].stage = newStage;

    // Send visual rage to tab
    const lines = LINES[newStage];
    chrome.tabs.sendMessage(id, {
      type: 'SCREAM',
      emoji: EMOJIS[newStage],
      line: lines[Math.floor(Math.random() * lines.length)]
    }).catch(() => {});

    // Send audio scream to offscreen synth
    if (!muted) {
      await ensureOffscreen();
      sendAudio({ type: 'PLAY_AUDIO', tabId: id, stage: newStage });
    }
  }

  // Update extension badge
  try {
    chrome.action.setBadgeBackgroundColor({ color: '#c0392b' });
    chrome.action.setBadgeText({ text: screamCount > 0 ? String(screamCount) : '' });
  } catch (e) {}

  return screamCount;
}

function sendAudio(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {});
}

// ── Event listeners ─────────────────────────────────────────────────
chrome.tabs.onActivated.addListener(() => checkTabs());

chrome.tabs.onRemoved.addListener(tabId => {
  delete state[tabId];
  sendAudio({ type: 'STOP_AUDIO', tabId });
});

// Message hub
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_STATUS') {
    const screaming = Object.values(state).filter(s => s.stage >= 0).length;
    const stages = Object.values(state).map(s => s.stage);
    sendResponse({ screaming, stages, total: Object.keys(state).length });
    return false; // synchronous response
  }

  if (msg.type === 'FORCE_DEMO_SCREAM') {
    (async () => {
      const { muted } = await getSettings();
      const allTabs = await chrome.tabs.query({});
      const activeTabs = await chrome.tabs.query({ active: true });
      const activeIds = new Set(activeTabs.map(t => t.id));

      let stageIdx = 0;
      for (const tab of allTabs) {
        if (!activeIds.has(tab.id)) {
          const s = stageIdx % 4;
          state[tab.id] = { lastActive: Date.now() - 50_000, stage: s };
          chrome.tabs.sendMessage(tab.id, {
            type: 'SCREAM',
            emoji: EMOJIS[s],
            line: LINES[s][0]
          }).catch(() => {});

          if (!muted) {
            await ensureOffscreen();
            sendAudio({ type: 'PLAY_AUDIO', tabId: tab.id, stage: s });
          }
          stageIdx++;
        }
      }
      checkTabs();
      sendResponse({ ok: true });
    })();
    return true; // async
  }

  if (msg.type === 'CALM_ALL') {
    for (const id in state) {
      chrome.tabs.sendMessage(Number(id), { type: 'RESTORE' }).catch(() => {});
      state[id] = { lastActive: Date.now(), stage: -1 };
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
      state[id] = { lastActive: Date.now(), stage: -1 };
    }
    sendAudio({ type: 'STOP_ALL' });
  }

  if (changes.muted) {
    if (changes.muted.newValue) {
      sendAudio({ type: 'STOP_ALL' });
    } else {
      await ensureOffscreen();
      for (const [id, s] of Object.entries(state)) {
        if (s.stage >= 0) sendAudio({ type: 'PLAY_AUDIO', tabId: Number(id), stage: s.stage });
      }
    }
  }
  checkTabs();
});

// Check every 2 seconds
setInterval(checkTabs, 2000);
checkTabs();

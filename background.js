/* Micro-Screamer — Background Service Worker */

const EMOJIS = ['🥺', '😠', '😡', '🤬'];

const LINES = [
  ['bakit mo ako iniwan?', 'miss na kita...', 'hello? nandito pa ako...', 'pansinin mo naman ako...', 'ang tagal mo na dun ha...'],
  ['EXCUSE ME??', 'ang tagal mo na!', 'NAKA-SEEN LANG AKO??', 'may iba ka na bang tab?', 'i-CLOSE mo na lang ako kung ganyan'],
  ['GRABE KA TALAGA', 'HINDI AKO OKAY', 'ANO BA PROBLEMA MO??', 'sinasabi ko sayo HA', 'LAST STRAW NA 'TO'],
  ['WALA NA FINISH NA', 'I TRUSTED YOU', 'NEVER AGAIN', 'BLOCKED AND REPORTED', 'GOODBYE FOREVER']
];

const state = {}; // tabId → { lastActive, stage }
let hasOffscreen = false;

// ── Offscreen document ──────────────────────────────────────────────
async function ensureOffscreen() {
  if (hasOffscreen) return;
  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Playing tab accountability audio alerts'
    });
  } catch { /* already exists */ }
  hasOffscreen = true;
}

// ── Settings helper ─────────────────────────────────────────────────
async function getSettings() {
  const d = await chrome.storage.local.get(['demoMode', 'muted']);
  return { demo: !!d.demoMode, muted: !!d.muted };
}

// ── Main check loop ─────────────────────────────────────────────────
async function checkTabs() {
  const { demo, muted } = await getSettings();
  const threshold   = demo ? 10_000 : 600_000;   // 10 s / 10 min
  const stageStep   = demo ? 10_000 : 600_000;   // time per rage level

  const allTabs    = await chrome.tabs.query({});
  const activeTabs = await chrome.tabs.query({ active: true });
  const activeIds  = new Set(activeTabs.map(t => t.id));

  let screamCount = 0;

  for (const tab of allTabs) {
    const id = tab.id;
    if (!state[id]) state[id] = { lastActive: Date.now(), stage: -1 };

    // Active or audible → not screaming
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

    if (newStage === state[id].stage) continue; // no change
    state[id].stage = newStage;

    // Update favicon + title
    const lines = LINES[newStage];
    chrome.tabs.sendMessage(id, {
      type: 'SCREAM',
      emoji: EMOJIS[newStage],
      line: lines[Math.floor(Math.random() * lines.length)]
    }).catch(() => {});

    // Update audio
    if (!muted) {
      await ensureOffscreen();
      sendAudio({ type: 'PLAY_AUDIO', tabId: id, stage: newStage });
    }
  }

  // Badge
  chrome.action.setBadgeBackgroundColor({ color: '#c0392b' });
  chrome.action.setBadgeText({ text: screamCount > 0 ? String(screamCount) : '' });
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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_STATUS') {
    const screaming = Object.values(state).filter(s => s.stage >= 0).length;
    sendResponse({ screaming });
    return true;
  }
});

chrome.storage.onChanged.addListener(async changes => {
  if (changes.demoMode) {
    // Reset all timers + restore tabs
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
      // Unmuted — restart audio for currently screaming tabs
      await ensureOffscreen();
      for (const [id, s] of Object.entries(state)) {
        if (s.stage >= 0) sendAudio({ type: 'PLAY_AUDIO', tabId: Number(id), stage: s.stage });
      }
    }
  }
  checkTabs();
});

// ── Kick off ────────────────────────────────────────────────────────
setInterval(checkTabs, 3000);
checkTabs();

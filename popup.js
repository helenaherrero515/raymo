/* RayMo — Popup Controller */

const demoEl = document.getElementById('demo');
const muteEl = document.getElementById('mute');
const dotEl  = document.getElementById('dot');
const statusTitleEl = document.getElementById('status-title');
const counterEl = document.getElementById('scream-counter');
const infoEl = document.getElementById('info');
const forceBtn = document.getElementById('btn-force-demo');
const calmBtn = document.getElementById('btn-calm');

const stageEls = [
  document.getElementById('stage-0'),
  document.getElementById('stage-1'),
  document.getElementById('stage-2'),
  document.getElementById('stage-3')
];

// 1. Load initial saved settings
chrome.storage.local.get(['demoMode', 'muted'], d => {
  demoEl.checked = d.demoMode !== undefined ? !!d.demoMode : true; // Default to demo mode
  muteEl.checked = !!d.muted;
});

demoEl.addEventListener('change', () => {
  chrome.storage.local.set({ demoMode: demoEl.checked });
  refresh();
});

muteEl.addEventListener('change', () => {
  chrome.storage.local.set({ muted: muteEl.checked });
});

// 2. Poll live status smoothly
async function refresh() {
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({});
  } catch (e) {}

  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, r => {
    const n = r?.screaming ?? 0;
    const stages = r?.stages || [];

    if (n > 0) {
      dotEl.className = 'status-dot active-screaming';
      statusTitleEl.textContent = 'Tabs Screaming!';
      statusTitleEl.style.color = '#ff7675';
      counterEl.textContent = `${n} screaming`;
      counterEl.style.color = '#ff7675';
      infoEl.textContent = `Warning: ${n} neglected tab${n > 1 ? 's' : ''} currently guilting you.`;
    } else {
      dotEl.className = 'status-dot';
      statusTitleEl.textContent = 'Tabs Peaceful';
      statusTitleEl.style.color = '#fff';
      counterEl.textContent = '0 screaming';
      counterEl.style.color = '#8e929b';
      infoEl.textContent = `Monitoring ${tabs.length} tab${tabs.length !== 1 ? 's' : ''}. Switch away to hear them whimper.`;
    }

    // Highlight active stages
    stageEls.forEach((el, idx) => {
      if (stages.includes(idx)) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });
  });
}

// 3. Demo Hackathon buttons
forceBtn.addEventListener('click', () => {
  forceBtn.textContent = '🚨 Screaming!';
  chrome.runtime.sendMessage({ type: 'FORCE_DEMO_SCREAM' }, () => {
    setTimeout(() => { forceBtn.textContent = '⚡ Demo Scream'; }, 2000);
    refresh();
  });
});

calmBtn.addEventListener('click', () => {
  calmBtn.textContent = '✓ Calmed';
  chrome.runtime.sendMessage({ type: 'CALM_ALL' }, () => {
    setTimeout(() => { calmBtn.textContent = '🤫 Calm All'; }, 1500);
    refresh();
  });
});

refresh();
setInterval(refresh, 1500);

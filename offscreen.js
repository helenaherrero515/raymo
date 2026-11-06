/* RayMo — Zero-Asset Synthetic Audio Engine */
console.log('[RayMo Audio Engine] Offscreen script running via external JS');

const audioElements = {};
let webAudioCtx = null;
const webAudioVoices = {};

function writeStr(view, offset, str) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

// Generate in-memory synthetic 16-bit PCM WAV (pure mathematical waves)
function createSyntheticVoiceWav(type, freq, durationSec, vibHz, vibDepth, tremHz, vol) {
  const sampleRate = 22050;
  const numSamples = Math.floor(sampleRate * durationSec);
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  // RIFF Header
  writeStr(view, 0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(view, 8, 'WAVE');

  // fmt chunk
  writeStr(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // Linear PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true); // 16-bit

  // data chunk
  writeStr(view, 36, 'data');
  view.setUint32(40, numSamples * 2, true);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // Vibrato pitch wobble
    const currentFreq = freq + Math.sin(2 * Math.PI * vibHz * t) * vibDepth;
    // Tremolo volume pulse
    const currentVol = vol * (0.65 + 0.35 * Math.sin(2 * Math.PI * tremHz * t));

    let sample = 0;
    const phase = (t * currentFreq) % 1;
    if (type === 'sine') {
      sample = Math.sin(2 * Math.PI * phase);
    } else if (type === 'triangle') {
      sample = phase < 0.5 ? (4 * phase - 1) : (3 - 4 * phase);
    } else if (type === 'sawtooth') {
      sample = 2 * phase - 1;
    } else if (type === 'square') {
      sample = phase < 0.5 ? 1 : -1;
    }

    const val = Math.max(-32768, Math.min(32767, Math.floor(sample * currentVol * 32767)));
    view.setInt16(44 + i * 2, val, true);
  }

  const blob = new Blob([buffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

const STAGE_CONFIGS = [
  // Stage 0: 🥺 Whimper — Soft wobbly sine wave
  { wave: 'sine',     freq: 220, dur: 2.0, vibHz: 4.5, vibD: 35,  tremHz: 2.0, vol: 0.35 },
  // Stage 1: 😠 Annoyance — Nasal triangle wave
  { wave: 'triangle', freq: 340, dur: 1.8, vibHz: 6.5, vibD: 60,  tremHz: 3.5, vol: 0.48 },
  // Stage 2: 😡 Confrontation — Harsh sawtooth wave
  { wave: 'sawtooth', freq: 480, dur: 1.5, vibHz: 8.5, vibD: 95,  tremHz: 5.5, vol: 0.60 },
  // Stage 3: 🤬 Drowning Meltdown — Piercing loud square wave
  { wave: 'square',   freq: 660, dur: 1.2, vibHz: 12.0, vibD: 140, tremHz: 8.5, vol: 0.75 }
];

function playTab(tabId, stage) {
  stopTab(tabId);
  const cfg = STAGE_CONFIGS[stage] || STAGE_CONFIGS[0];
  const offset = (tabId % 7) * 28; // Unique frequency offset per tab for screaming chorus
  const targetFreq = cfg.freq + offset;

  console.log(`[RayMo Audio] Playing scream for tab ${tabId} (Stage ${stage}) at ${targetFreq}Hz`);

  try {
    // 1. Play synthetic WAV via Audio element (whitelisted by Chrome offscreen AUDIO_PLAYBACK)
    const wavUrl = createSyntheticVoiceWav(
      cfg.wave,
      targetFreq,
      cfg.dur,
      cfg.vibHz + (tabId % 3),
      cfg.vibD,
      cfg.tremHz,
      cfg.vol
    );

    const audio = new Audio(wavUrl);
    audio.loop = true;
    audio.volume = 1.0;
    document.body.appendChild(audio);

    audio.play().then(() => {
      console.log(`[RayMo Audio] HTML Audio playing for tab ${tabId}`);
    }).catch(err => {
      console.warn(`[RayMo Audio] Audio play error:`, err);
    });

    audioElements[tabId] = { audio, url: wavUrl };
  } catch (err) {
    console.error(`[RayMo Audio] Voice generation error:`, err);
  }

  // 2. Play complementary Web Audio API layer
  try {
    if (!webAudioCtx) {
      webAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (webAudioCtx.state === 'suspended') {
      webAudioCtx.resume();
    }
    const osc = webAudioCtx.createOscillator();
    osc.type = cfg.wave;
    osc.frequency.value = targetFreq;

    const gain = webAudioCtx.createGain();
    gain.gain.value = cfg.vol * 0.4;
    osc.connect(gain).connect(webAudioCtx.destination);
    osc.start();

    webAudioVoices[tabId] = { osc, gain };
  } catch (e) {}
}

function stopTab(tabId) {
  if (audioElements[tabId]) {
    try {
      audioElements[tabId].audio.pause();
      audioElements[tabId].audio.remove();
      URL.revokeObjectURL(audioElements[tabId].url);
    } catch (e) {}
    delete audioElements[tabId];
  }

  if (webAudioVoices[tabId]) {
    try {
      webAudioVoices[tabId].osc.stop();
      webAudioVoices[tabId].osc.disconnect();
    } catch (e) {}
    delete webAudioVoices[tabId];
  }
}

function stopAll() {
  console.log('[RayMo Audio] Stopping all audio voices');
  Object.keys(audioElements).forEach(id => stopTab(Number(id)));
  Object.keys(webAudioVoices).forEach(id => stopTab(Number(id)));
}

// ── Message Listener ──
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'PLAY_AUDIO') {
    playTab(msg.tabId, msg.stage);
    sendResponse({ ok: true });
    return false;
  }
  if (msg.type === 'STOP_AUDIO') {
    stopTab(msg.tabId);
    sendResponse({ ok: true });
    return false;
  }
  if (msg.type === 'STOP_ALL') {
    stopAll();
    sendResponse({ ok: true });
    return false;
  }
  if (msg.type === 'PING') {
    sendResponse({ ready: true });
    return false;
  }
});

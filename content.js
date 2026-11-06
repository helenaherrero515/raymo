/* RayMo — Content Script (Shaking Meme Favicon & Vibrating Title) */

let originalTitle = null;
let originalFaviconHref = null;
let isScreaming = false;
let shakeTimer = null;
let currentStage = 0;
let currentLine = '';
let currentMemeImg = null;

// Snapshot the tab's original identity before modifying
function snapshot() {
  if (isScreaming) return;
  originalTitle = document.title;
  const link = document.querySelector('link[rel*="icon"]');
  originalFaviconHref = link ? link.href : '/favicon.ico';
}

// Canvas used to render the shaking meme face favicon
const canvas = document.createElement('canvas');
canvas.width = 32;
canvas.height = 32;
const ctx = canvas.getContext('2d');

let shakeFrame = 0;
function renderShakingFavicon() {
  if (!ctx) return;
  shakeFrame++;

  ctx.clearRect(0, 0, 32, 32);
  ctx.save();

  // Shaking physics: intensify shake with rage stage (0 to 3)
  const intensity = (currentStage + 1) * 0.8;
  const angle = (shakeFrame % 2 === 0 ? -0.14 : 0.14) * intensity;
  const shiftX = (shakeFrame % 2 === 0 ? -2 : 2) * (intensity > 1 ? 1 : 0.6);
  const shiftY = (shakeFrame % 3 === 0 ? -1 : 1);

  ctx.translate(16 + shiftX, 16 + shiftY);
  ctx.rotate(angle);

  // Circular avatar clip
  ctx.beginPath();
  ctx.arc(0, 0, 15, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  if (currentMemeImg && currentMemeImg.complete && currentMemeImg.naturalWidth > 0) {
    ctx.drawImage(currentMemeImg, -16, -16, 32, 32);
  } else {
    // High-visibility fallback rage circle with exclamation
    ctx.fillStyle = currentStage >= 2 ? '#c0392b' : '#f39c12';
    ctx.fillRect(-16, -16, 32, 32);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', 0, 0);
  }

  // Red alert ring when at higher rage stages
  if (currentStage >= 2) {
    ctx.strokeStyle = '#e74c3c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();

  // Apply to favicon
  const dataUrl = canvas.toDataURL('image/png');
  let link = document.querySelector('link[rel="icon"]');
  if (!link) {
    document.querySelectorAll('link[rel*="icon"]').forEach(el => el.remove());
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.type = 'image/png';
  link.href = dataUrl;

  // Title shaking animation
  const titleShakes = [
    `😱 [ ${currentLine} ]`,
    `🚨 ( ${currentLine} )`,
    `🔥 { ${currentLine} }`,
    `⚡ < ${currentLine} >`
  ];
  document.title = titleShakes[shakeFrame % titleShakes.length];
}

function startShaking(imageName, line, stage) {
  snapshot();
  isScreaming = true;
  currentStage = stage || 0;
  currentLine = line || 'bakit mo ako iniwan?';

  // Load the meme face image
  const imgUrl = chrome.runtime.getURL(imageName || 'face-cry.jpg');
  currentMemeImg = new Image();
  currentMemeImg.crossOrigin = 'anonymous';
  currentMemeImg.src = imgUrl;

  if (shakeTimer) clearInterval(shakeTimer);

  // Faster shake speed at higher rage levels (220ms -> 140ms)
  const intervalMs = Math.max(140, 240 - currentStage * 30);
  shakeTimer = setInterval(renderShakingFavicon, intervalMs);
  renderShakingFavicon();
}

function restore() {
  if (!isScreaming) return;

  if (shakeTimer) {
    clearInterval(shakeTimer);
    shakeTimer = null;
  }

  if (originalTitle !== null) {
    document.title = originalTitle;
  }

  document.querySelectorAll('link[rel*="icon"]').forEach(el => el.remove());
  if (originalFaviconHref) {
    const link = document.createElement('link');
    link.rel = 'icon';
    link.href = originalFaviconHref;
    document.head.appendChild(link);
  }

  isScreaming = false;
  originalTitle = null;
  originalFaviconHref = null;
  currentMemeImg = null;
}

chrome.runtime.onMessage.addListener(msg => {
  if (msg.type === 'SCREAM') {
    startShaking(msg.image, msg.line, msg.stage);
  } else if (msg.type === 'RESTORE') {
    restore();
  }
});

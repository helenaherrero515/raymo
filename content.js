/* Micro-Screamer — Content Script (favicon + title override) */

let originalTitle = null;
let originalFaviconHref = null;
let isScreaming = false;

function snapshot() {
  if (isScreaming) return;
  originalTitle = document.title;
  const link = document.querySelector('link[rel~="icon"], link[rel="shortcut icon"]');
  originalFaviconHref = link ? link.href : null;
}

function setEmojiFavicon(emoji) {
  const href =
    `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22>` +
    `<text y=%22.9em%22 font-size=%2290%22>${emoji}</text></svg>`;
  let link = document.querySelector('link[rel~="icon"], link[rel="shortcut icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.type = 'image/svg+xml';
  link.href = href;
}

function restore() {
  if (!isScreaming) return;
  document.title = originalTitle ?? document.title;
  const link = document.querySelector('link[rel~="icon"], link[rel="shortcut icon"]');
  if (link && originalFaviconHref) {
    link.href = originalFaviconHref;
    link.type = '';
  } else if (link && !originalFaviconHref) {
    link.remove(); // page had no favicon originally
  }
  isScreaming = false;
  originalTitle = null;
  originalFaviconHref = null;
}

chrome.runtime.onMessage.addListener(msg => {
  if (msg.type === 'SCREAM') {
    snapshot();
    isScreaming = true;
    document.title = msg.line;
    setEmojiFavicon(msg.emoji);
  } else if (msg.type === 'RESTORE') {
    restore();
  }
});

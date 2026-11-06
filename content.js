/* RayMo — Content Script (In-page Favicon & Title Override) */

let originalTitle = null;
let originalFaviconHref = null;
let isScreaming = false;

function snapshot() {
  if (isScreaming) return;
  originalTitle = document.title;
  const link = document.querySelector('link[rel*="icon"]');
  originalFaviconHref = link ? link.href : null;
}

function setEmojiFavicon(emoji) {
  const href =
    `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22>` +
    `<text y=%22.9em%22 font-size=%2290%22>${emoji}</text></svg>`;

  // Remove existing favicons so the browser is forced to display RayMo's face
  const existing = document.querySelectorAll('link[rel*="icon"]');
  existing.forEach(el => el.remove());

  const link = document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/svg+xml';
  link.href = href;
  document.head.appendChild(link);
}

function restore() {
  if (!isScreaming) return;
  if (originalTitle !== null) {
    document.title = originalTitle;
  }

  // Clear emoji favicon
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
}

chrome.runtime.onMessage.addListener(msg => {
  if (msg.type === 'SCREAM') {
    snapshot();
    isScreaming = true;
    document.title = `${msg.emoji} ${msg.line}`;
    setEmojiFavicon(msg.emoji);
  } else if (msg.type === 'RESTORE') {
    restore();
  }
});

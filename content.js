// Finds every video thumbnail on YouTube and swaps it for a frame from inside
// the video. Also adds a small button (shown on hover) to change one video's
// thumbnail without touching the global setting.
(() => {
  const MODES = ['auto', '1', '2', '3', 'original'];
  const OVERRIDE_LIMIT = 500;

  // Matches YouTube's normal thumbnail images (hqdefault, hq720, mqdefault,
  // oardefault for Shorts, ..._live), but not chapter frames like
  // hqdefault_1866.jpg or our own hq1/sd1/maxres1 frames.
  const THUMB_RE =
    /^https:\/\/i\d?\.ytimg\.com\/vi(?:_webp)?\/([\w-]{11})\/(?:[a-z0-9]*default|hq720|oar\d)(?:_live)?\.(?:jpg|webp)/;

  let globalMode = 'auto';
  let overrides = {}; // video id -> mode
  const results = new Map(); // video id -> Promise<analysis>

  const ready = Promise.all([
    chrome.storage.sync.get({ mode: 'auto' }),
    chrome.storage.local.get({ overrides: {} }),
  ]).then(([sync, local]) => {
    globalMode = sync.mode;
    overrides = local.overrides;
  });

  function modeFor(id) {
    return overrides[id] || globalMode;
  }

  function analyze(id) {
    if (!results.has(id)) {
      results.set(
        id,
        chrome.runtime.sendMessage({ type: 'analyze', id }).catch(() => null)
      );
    }
    return results.get(id);
  }

  function setSrc(img, url) {
    delete img.dataset.crPending;
    if (img.src === url) return;
    img.dataset.crSet = url;
    img.removeAttribute('srcset');
    img.src = url;
  }

  async function apply(img) {
    await ready;
    const id = img.dataset.crId;
    const original = img.dataset.crOriginal;
    const mode = modeFor(id);
    ensureButton(img);

    if (mode === 'original') {
      setSrc(img, original);
      updateButton(img, mode, null);
      return;
    }

    img.dataset.crPending = '';
    const info = await analyze(id);
    if (img.dataset.crId !== id) return; // YouTube reused this image meanwhile

    let frame = info?.frames?.[(mode === 'auto' ? info.best : Number(mode)) - 1];
    if (!frame && info?.best) frame = info.frames[info.best - 1]; // asked-for frame missing
    setSrc(img, frame ? frame.url : original);
    updateButton(img, mode, frame ? frame.n : null);
  }

  function check(img) {
    if (!(img instanceof HTMLImageElement)) return;
    const src = img.src;
    if (!src || src === img.dataset.crSet) return;
    const match = THUMB_RE.exec(src);
    if (!match) return;
    img.dataset.crId = match[1];
    img.dataset.crOriginal = src;
    if (globalMode !== 'original' || overrides[match[1]]) img.dataset.crPending = '';
    apply(img);
  }

  // ---- per-video hover button ----
  // One floating button for the whole page. It can't live inside the
  // thumbnail because YouTube's hover preview video covers the thumbnail.

  let floatBtn = null;
  let hoverHost = null;

  function hostFor(img) {
    return img.closest('a') || img.parentElement;
  }

  function ensureButton(img) {
    const host = hostFor(img);
    if (!host) return;
    host.crImg = img;
    host.classList.add('cr-host');
  }

  function getFloatBtn() {
    if (floatBtn) return floatBtn;
    floatBtn = document.createElement('button');
    floatBtn.id = 'cr-float';
    floatBtn.type = 'button';
    floatBtn.title = 'Click Rate: change this thumbnail';
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
      floatBtn.addEventListener(type, (e) => e.stopPropagation());
    }
    floatBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = hoverHost?.crImg?.dataset.crId;
      if (id) cycle(id);
    });
    document.documentElement.appendChild(floatBtn);
    return floatBtn;
  }

  function labelFor(img) {
    const mode = modeFor(img.dataset.crId);
    const shown = img.dataset.crShown;
    if (mode === 'original') return 'Original';
    if (mode === 'auto') return shown ? `Auto · ${shown}` : 'Auto';
    return shown && shown !== mode ? `Frame ${mode} → ${shown}` : `Frame ${mode}`;
  }

  function showButton(host) {
    const img = host.crImg;
    const rect = host.getBoundingClientRect();
    if (!img?.dataset.crId || rect.width < 120) return hideButton();
    hoverHost = host;
    const btn = getFloatBtn();
    btn.textContent = `⟳ ${labelFor(img)}`;
    btn.classList.toggle('cr-custom', Boolean(overrides[img.dataset.crId]));
    btn.style.left = `${rect.left + 6}px`;
    btn.style.top = `${rect.top + 6}px`;
    btn.classList.add('cr-visible');
  }

  function hideButton() {
    hoverHost = null;
    floatBtn?.classList.remove('cr-visible');
  }

  function inside(rect, x, y) {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  document.addEventListener(
    'mousemove',
    (e) => {
      if (e.target === floatBtn) return;
      const host = e.target.closest?.('.cr-host');
      if (host) return showButton(host);
      // The hover preview sits on top of the thumbnail; keep the button while
      // the pointer is still over the thumbnail underneath it.
      if (hoverHost && inside(hoverHost.getBoundingClientRect(), e.clientX, e.clientY)) {
        return showButton(hoverHost);
      }
      hideButton();
    },
    { passive: true, capture: true }
  );
  document.addEventListener('scroll', hideButton, { passive: true, capture: true });

  function updateButton(img, mode, shown) {
    if (shown) img.dataset.crShown = String(shown);
    else delete img.dataset.crShown;
    if (hoverHost && hoverHost.crImg === img) showButton(hoverHost);
  }

  function cycle(id) {
    const next = MODES[(MODES.indexOf(modeFor(id)) + 1) % MODES.length];
    if (next === globalMode) delete overrides[id];
    else overrides[id] = next;

    const ids = Object.keys(overrides);
    if (ids.length > OVERRIDE_LIMIT) delete overrides[ids[0]];
    chrome.storage.local.set({ overrides });
    reapply((img) => img.dataset.crId === id);
  }

  function reapply(filter = () => true) {
    document.querySelectorAll('img[data-cr-id]').forEach((img) => {
      if (filter(img)) apply(img);
    });
  }

  // ---- watch the page ----

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.mode) {
      globalMode = changes.mode.newValue || 'auto';
      reapply();
    }
    if (area === 'local' && changes.overrides) {
      overrides = changes.overrides.newValue || {};
      reapply();
    }
  });

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'attributes') {
        check(m.target);
        continue;
      }
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.tagName === 'IMG') check(node);
        else node.querySelectorAll?.('img').forEach(check);
      }
    }
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['src'],
  });
  document.querySelectorAll('img').forEach(check);
})();

const radios = document.querySelectorAll('input[name="mode"]');
const count = document.getElementById('count');
const reset = document.getElementById('reset');

async function load() {
  const [{ mode }, { overrides }] = await Promise.all([
    chrome.storage.sync.get({ mode: 'auto' }),
    chrome.storage.local.get({ overrides: {} }),
  ]);
  radios.forEach((r) => (r.checked = r.value === mode));
  showCount(Object.keys(overrides).length);
}

function showCount(n) {
  count.textContent = n ? `${n} video${n === 1 ? '' : 's'} set by hand` : '';
  reset.hidden = n === 0;
}

radios.forEach((r) =>
  r.addEventListener('change', () => chrome.storage.sync.set({ mode: r.value }))
);

reset.addEventListener('click', async () => {
  await chrome.storage.local.set({ overrides: {} });
  showCount(0);
});

load();

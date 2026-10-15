const radios = document.querySelectorAll('input[name="mode"]');

chrome.storage.sync.get({ mode: 'auto' }).then(({ mode }) => {
  radios.forEach((r) => (r.checked = r.value === mode));
});

radios.forEach((r) =>
  r.addEventListener('change', () => chrome.storage.sync.set({ mode: r.value }))
);

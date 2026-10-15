// Runs the frame analysis for the YouTube tabs. It lives here rather than in
// the page so it can read i.ytimg.com images without hitting page security rules.
importScripts('frames.js');

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type !== 'analyze' || typeof msg.id !== 'string') return;
  crAnalyzeCached(msg.id).then(reply);
  return true; // reply comes later
});

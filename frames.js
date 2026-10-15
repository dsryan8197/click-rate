// Picks a frame from inside a YouTube video to use as its thumbnail.
//
// YouTube automatically saves three still frames from every video, at about
// 25%, 50% and 75% of the way through. They're public images:
//   i.ytimg.com/vi/<id>/hq1.jpg   480x360, always there (if any frames are)
//   i.ytimg.com/vi/<id>/sd1.jpg   640x480, most videos
//   i.ytimg.com/vi/<id>/maxres1.jpg   1280x720, HD videos
//
// "Auto" mode scores the three frames with plain pixel maths (no AI):
//   brightness  - rejects black screens and white flashes
//   contrast    - flat slides and solid backgrounds score low
//   detail      - edges (faces, objects, scenery) score high
//   colour      - real scenes are usually more colourful than text cards
// The highest score wins; the middle frame wins ties.

const CR_YTIMG = 'https://i.ytimg.com/vi/';
const CR_SAMPLE_W = 96;
const CR_SAMPLE_H = 54;
const CR_MAX_PARALLEL = 6;
const CR_CACHE_LIMIT = 3000;

const crCache = new Map(); // video id -> Promise<result>
const crQueue = [];
let crActive = 0;

function crFrameUrl(id, size, n) {
  return `${CR_YTIMG}${id}/${size}${n}.jpg`;
}

// Scores raw RGBA pixels. Exported for tests.
function crScorePixels(data, w, h) {
  const n = w * h;
  const lum = new Float32Array(n);
  let sum = 0, sumSq = 0;
  let rgSum = 0, rgSq = 0, ybSum = 0, ybSq = 0;

  for (let i = 0; i < n; i++) {
    const r = data[i * 4] / 255, g = data[i * 4 + 1] / 255, b = data[i * 4 + 2] / 255;
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    lum[i] = l;
    sum += l;
    sumSq += l * l;
    const rg = r - g, yb = 0.5 * (r + g) - b;
    rgSum += rg; rgSq += rg * rg;
    ybSum += yb; ybSq += yb * yb;
  }

  let edge = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x > 0) edge += Math.abs(lum[i] - lum[i - 1]);
      if (y > 0) edge += Math.abs(lum[i] - lum[i - w]);
    }
  }

  const brightness = sum / n;
  const contrast = Math.sqrt(Math.max(0, sumSq / n - brightness * brightness));
  const detail = edge / (2 * n);
  // Hasler & Suesstrunk colourfulness, scaled to roughly 0..1.
  const rgMean = rgSum / n, ybMean = ybSum / n;
  const rgStd = Math.sqrt(Math.max(0, rgSq / n - rgMean * rgMean));
  const ybStd = Math.sqrt(Math.max(0, ybSq / n - ybMean * ybMean));
  const colour = Math.hypot(rgStd, ybStd) + 0.3 * Math.hypot(rgMean, ybMean);

  const usable = brightness > 0.07 && brightness < 0.96 && contrast > 0.03;
  const score = usable ? contrast + 3 * detail + 0.5 * colour : -1;
  return { score, brightness, contrast, detail, colour };
}

async function crScoreFrame(id, n) {
  const res = await fetch(crFrameUrl(id, 'hq', n));
  if (!res.ok) return null;
  const bitmap = await createImageBitmap(await res.blob());
  // A missing frame comes back as a tiny grey placeholder.
  if (bitmap.width < 200) return null;

  // hq frames are 4:3 with black bars above and below widescreen video,
  // so only sample the middle 75% of the height.
  const canvas = new OffscreenCanvas(CR_SAMPLE_W, CR_SAMPLE_H);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const top = bitmap.height * 0.125;
  ctx.drawImage(bitmap, 0, top, bitmap.width, bitmap.height * 0.75, 0, 0, CR_SAMPLE_W, CR_SAMPLE_H);
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, CR_SAMPLE_W, CR_SAMPLE_H);
  return crScorePixels(data, CR_SAMPLE_W, CR_SAMPLE_H).score;
}

async function crExists(url) {
  try {
    return (await fetch(url, { method: 'HEAD' })).ok;
  } catch {
    return false;
  }
}

// Finds the sharpest size YouTube has for this video. If one frame exists at a
// size, the other two do too, so only frame 2 is checked.
async function crBestSize(id) {
  if (await crExists(crFrameUrl(id, 'maxres', 2))) return 'maxres';
  if (await crExists(crFrameUrl(id, 'sd', 2))) return 'sd';
  return 'hq';
}

async function crAnalyze(id) {
  const [scores, size] = await Promise.all([
    Promise.all([1, 2, 3].map((n) => crScoreFrame(id, n).catch(() => null))),
    crBestSize(id),
  ]);

  const frames = scores.map((score, i) =>
    score === null ? null : { n: i + 1, score, url: crFrameUrl(id, size, i + 1) }
  );

  // Middle frame first so it wins ties.
  let best = null;
  for (const f of [frames[1], frames[0], frames[2]]) {
    if (f && (!best || f.score > best.score + 0.01)) best = f;
  }
  return { frames, best: best ? best.n : null };
}

function crRunQueue() {
  while (crActive < CR_MAX_PARALLEL && crQueue.length) {
    const job = crQueue.shift();
    crActive++;
    crAnalyze(job.id)
      .then(job.resolve, () => job.resolve(null))
      .finally(() => {
        crActive--;
        crRunQueue();
      });
  }
}

function crAnalyzeCached(id) {
  if (crCache.has(id)) return crCache.get(id);
  if (crCache.size >= CR_CACHE_LIMIT) crCache.delete(crCache.keys().next().value);
  const promise = new Promise((resolve) => {
    crQueue.push({ id, resolve });
    crRunQueue();
  });
  crCache.set(id, promise);
  return promise;
}

// Checks the frame scorer on made-up images. Run: node tests/score.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'frames.js'), 'utf8'), ctx);
const { crScorePixels } = ctx;

const W = 96, H = 54;
function image(pixel) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [r, g, b] = pixel(x, y);
      data.set([r, g, b, 255], (y * W + x) * 4);
    }
  }
  return crScorePixels(data, W, H).score;
}

const black = image(() => [3, 3, 3]);
const white = image(() => [252, 252, 252]);
const flatGrey = image(() => [120, 120, 120]);
const textSlide = image((x, y) => (y % 9 < 2 && x > 10 && x < 80 ? [20, 20, 20] : [235, 235, 235]));
let seed = 1;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 255;
const scene = image(() => [rand(), rand() * 0.8, rand() * 0.5]);

assert.strictEqual(black, -1, 'black frame should be rejected');
assert.strictEqual(white, -1, 'white flash should be rejected');
assert.strictEqual(flatGrey, -1, 'flat frame should be rejected');
assert.ok(scene > textSlide, `busy colourful scene (${scene}) should beat a text slide (${textSlide})`);

console.log('score tests passed', { textSlide: textSlide.toFixed(3), scene: scene.toFixed(3) });

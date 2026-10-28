// Draws Retrace's icon: a dark editor window with glowing, syntax-coloured
// lines of code and a text cursor. Writes it as src/app/favicon.ico, which is
// both the browser tab icon and the desktop shortcut's icon.
// Pure Node (zlib for PNG), no image libraries.
//
//   node scripts/make-icon.mjs                 write the icon
//   node scripts/make-icon.mjs --preview x.png also save a 256px preview
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const SAMPLES = 4; // supersampling per axis, for smooth edges

// ---------------------------------------------------------------- PNG + ICO

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function ico(images, sizes) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(sizes.length, 4);
  let offset = 6 + 16 * sizes.length;
  const entries = sizes.map((size, i) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0);
    entry.writeUInt8(size === 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(images[i].length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += images[i].length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images]);
}

// ---------------------------------------------------------------- the picture
// Unit coordinates: 0..1, y down. Distances are negative inside a shape.

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

const TOP = hex("#1d2433"); // tile background, top of the gradient
const BOTTOM = hex("#090c12"); // and bottom
const EDGE = hex("#3a4250"); // thin tile border
const RULE = hex("#2a3140"); // line under the title bar

function roundedSquare(x, y, inset, radius) {
  const lo = inset + radius;
  const hi = 1 - inset - radius;
  const dx = Math.max(lo - x, 0, x - hi);
  const dy = Math.max(lo - y, 0, y - hi);
  return Math.hypot(dx, dy) - radius;
}

function capsule(x, y, x1, x2, yc, r) {
  const px = Math.min(Math.max(x, x1), x2);
  return Math.hypot(x - px, y - yc) - r;
}

function vcapsule(x, y, xc, y1, y2, r) {
  const py = Math.min(Math.max(y, y1), y2);
  return Math.hypot(x - xc, y - py) - r;
}

const LINE = 0.029; // half the thickness of a code line

/** The glowing parts, drawn in order: [distance(x, y), colour, glow strength]. */
const SHAPES = [
  // window controls
  [(x, y) => Math.hypot(x - 0.215, y - 0.2) - 0.033, hex("#ff5f57"), 0.35],
  [(x, y) => Math.hypot(x - 0.3, y - 0.2) - 0.033, hex("#febc2e"), 0.35],
  [(x, y) => Math.hypot(x - 0.385, y - 0.2) - 0.033, hex("#28c840"), 0.35],
  // code: keyword, name / indented call, string / indented value / keyword + cursor
  [(x, y) => capsule(x, y, 0.2, 0.31, 0.4, LINE), hex("#d2a8ff"), 0.9],
  [(x, y) => capsule(x, y, 0.37, 0.62, 0.4, LINE), hex("#79c0ff"), 0.9],
  [(x, y) => capsule(x, y, 0.29, 0.44, 0.52, LINE), hex("#7ee787"), 0.9],
  [(x, y) => capsule(x, y, 0.5, 0.78, 0.52, LINE), hex("#ffa657"), 0.9],
  [(x, y) => capsule(x, y, 0.29, 0.56, 0.64, LINE), hex("#ff7b72"), 0.9],
  [(x, y) => capsule(x, y, 0.2, 0.3, 0.76, LINE), hex("#d2a8ff"), 0.9],
  [(x, y) => vcapsule(x, y, 0.37, 0.715, 0.805, 0.016), hex("#e6edf3"), 1.2],
];

const GLOW = 0.05; // how far the glow spreads

function shade(x, y) {
  const t = Math.min(Math.max((y - 0.05) / 0.9, 0), 1);
  const color = TOP.map((c, i) => c + (BOTTOM[i] - c) * t);

  // Thin border just inside the tile edge, and a rule under the title bar.
  const edge = -roundedSquare(x, y, 0, 0.22);
  if (edge < 0.012) color.forEach((c, i) => (color[i] = c * 0.4 + EDGE[i] * 0.6));
  if (Math.abs(y - 0.29) < 0.006 && x > 0.06 && x < 0.94) {
    color.forEach((c, i) => (color[i] = c * 0.3 + RULE[i] * 0.7));
  }

  // Soft neon glow around every coloured shape, added light.
  for (const [distance, tint, strength] of SHAPES) {
    const d = distance(x, y);
    if (d > 0) {
      const glow = strength * Math.exp(-((d / GLOW) ** 2));
      for (let i = 0; i < 3; i++) color[i] += tint[i] * glow * 0.55;
    }
  }
  // Solid shapes on top, with a slightly brightened core.
  for (const [distance, tint] of SHAPES) {
    if (distance(x, y) <= 0)
      for (let i = 0; i < 3; i++) color[i] = Math.min(255, tint[i] * 1.05 + 12);
  }
  return color.map((c) => Math.min(255, c));
}

function draw(size) {
  const pixels = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const sum = [0, 0, 0];
      let covered = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = (px + (sx + 0.5) / SAMPLES) / size;
          const y = (py + (sy + 0.5) / SAMPLES) / size;
          if (roundedSquare(x, y, 0, 0.22) > 0) continue;
          covered++;
          const c = shade(x, y);
          for (let i = 0; i < 3; i++) sum[i] += c[i];
        }
      }
      const offset = (py * size + px) * 4;
      for (let i = 0; i < 3; i++) pixels[offset + i] = covered ? Math.round(sum[i] / covered) : 0;
      pixels[offset + 3] = Math.round((covered / (SAMPLES * SAMPLES)) * 255);
    }
  }
  return png(size, pixels);
}

const sizes = [16, 32, 48, 256];
const images = sizes.map(draw);
writeFileSync("src/app/favicon.ico", ico(images, sizes));
const previewAt = process.argv.indexOf("--preview");
if (previewAt !== -1 && process.argv[previewAt + 1])
  writeFileSync(process.argv[previewAt + 1], images[3]);
console.log("Wrote src/app/favicon.ico");

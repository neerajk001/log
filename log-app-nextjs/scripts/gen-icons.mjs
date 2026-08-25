import zlib from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const RUST = [0xc1, 0x44, 0x0e];
const WHITE = [0xec, 0xe8, 0xe0];

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function px(size, x, y) {
  const cx = size / 2;
  const cy = size / 2;
  const barHalf = size * 0.045;
  const plateR = size * 0.17;
  const plateL = size * 0.24;
  const plateRr = size * 0.76;

  const inBar = y >= cy - barHalf && y <= cy + barHalf && x >= size * 0.18 && x <= size * 0.82;
  const inL = (x - plateL) ** 2 + (y - cy) ** 2 <= plateR ** 2;
  const inR = (x - plateRr) ** 2 + (y - cy) ** 2 <= plateR ** 2;

  if (inBar || inL || inR) return [WHITE[0], WHITE[1], WHITE[2], 255];
  return [RUST[0], RUST[1], RUST[2], 255];
}

function makePng(size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const raw = Buffer.alloc((size * 4 + 1) * size);
  let pos = 0;
  for (let y = 0; y < size; y++) {
    raw[pos++] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = px(size, x, y);
      raw[pos++] = r;
      raw[pos++] = g;
      raw[pos++] = b;
      raw[pos++] = a;
    }
  }
  const idat = zlib.deflateSync(raw);
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', makePng(192));
writeFileSync('public/icons/icon-512.png', makePng(512));
writeFileSync('public/icons/icon-180.png', makePng(180));

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="96" fill="#c1440e"/>
  <g fill="#ece8e0">
    <rect x="98" y="236" width="316" height="40" rx="8"/>
    <circle cx="123" cy="256" r="87"/>
    <circle cx="389" cy="256" r="87"/>
  </g>
</svg>`;
writeFileSync('public/icons/icon.svg', svg);

console.log('icons written');

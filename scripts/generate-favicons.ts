/**
 * Regenerates the app icons from the master mascot artwork.
 *
 * Run with: npx tsx scripts/generate-favicons.ts
 *
 * The `.ico` matters beyond browser tabs: link unfurlers (YouTube's channel-bio
 * crawler among them) fetch `/favicon.ico` at the domain root and ignore the
 * hashed `/icon` route Next.js generates for `app/icon.png`, so the root file
 * has to exist as a real multi-size ICO.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.join(__dirname, "..");
const SOURCE = path.join(ROOT, "public/images/blu-favicon.png");

// Classic favicon sizes. Windows/legacy unfurlers look for 16 and 32; 48 is what
// most search crawlers downsample from.
const ICO_SIZES = [16, 32, 48];

/** Renders the source artwork to raw BGRA rows at a given square size. */
async function renderBgra(source: Buffer, size: number): Promise<Buffer> {
  const { data } = await sharp(source)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .raw()
    .ensureAlpha()
    .toBuffer({ resolveWithObject: true });

  const bgra = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 4) {
    bgra[i] = data[i + 2];
    bgra[i + 1] = data[i + 1];
    bgra[i + 2] = data[i];
    bgra[i + 3] = data[i + 3];
  }
  return bgra;
}

/**
 * Builds one ICO directory image as an uncompressed 32-bit DIB.
 *
 * PNG-compressed ICO entries are smaller but only parse in reasonably modern
 * readers; the DIB form is what every crawler can decode, which is the whole
 * point of this file.
 */
function buildDib(bgra: Buffer, size: number): Buffer {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0); // biSize
  header.writeInt32LE(size, 4); // biWidth
  header.writeInt32LE(size * 2, 8); // biHeight — XOR bitmap plus AND mask
  header.writeUInt16LE(1, 12); // biPlanes
  header.writeUInt16LE(32, 14); // biBitCount

  // DIB rows run bottom-up.
  const xor = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    const from = (size - 1 - y) * size * 4;
    bgra.copy(xor, y * size * 4, from, from + size * 4);
  }

  // 1bpp AND mask, rows padded to 4 bytes. Modern readers use the alpha channel
  // above, but legacy ones key transparency off this mask.
  const maskStride = Math.ceil(size / 32) * 4;
  const mask = Buffer.alloc(maskStride * size);
  for (let y = 0; y < size; y += 1) {
    const sourceRow = (size - 1 - y) * size * 4;
    for (let x = 0; x < size; x += 1) {
      if (bgra[sourceRow + x * 4 + 3] === 0) {
        mask[y * maskStride + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }

  header.writeUInt32LE(xor.length + mask.length, 20); // biSizeImage
  return Buffer.concat([header, xor, mask]);
}

async function buildIco(source: Buffer): Promise<Buffer> {
  const images = await Promise.all(
    ICO_SIZES.map(async (size) => buildDib(await renderBgra(source, size), size)),
  );

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  const directory = Buffer.alloc(16 * images.length);
  let offset = header.length + directory.length;

  images.forEach((image, index) => {
    const size = ICO_SIZES[index];
    const entry = index * 16;
    directory.writeUInt8(size === 256 ? 0 : size, entry); // width (0 means 256)
    directory.writeUInt8(size === 256 ? 0 : size, entry + 1); // height
    directory.writeUInt8(0, entry + 2); // palette colors
    directory.writeUInt8(0, entry + 3); // reserved
    directory.writeUInt16LE(1, entry + 4); // color planes
    directory.writeUInt16LE(32, entry + 6); // bits per pixel
    directory.writeUInt32LE(image.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += image.length;
  });

  return Buffer.concat([header, directory, ...images]);
}

async function writePng(source: Buffer, size: number, destination: string) {
  const png = await sharp(source)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, png);
  console.log(`${path.relative(ROOT, destination)} — ${size}x${size}, ${png.length} bytes`);
}

async function main() {
  const source = await readFile(SOURCE);

  const ico = await buildIco(source);
  await writeFile(path.join(ROOT, "app/favicon.ico"), ico);
  console.log(`app/favicon.ico — ${ICO_SIZES.join("/")}px, ${ico.length} bytes`);

  // Served at /icon for browser tabs and richer crawlers.
  await writePng(source, 512, path.join(ROOT, "app/icon.png"));
  // Served at /apple-icon for iOS home-screen bookmarks.
  await writePng(source, 180, path.join(ROOT, "app/apple-icon.png"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import { writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { type Zippable, zipSync } from "fflate";

// Builds zip files in memory for tests, including deliberately hostile ones.

export interface ZipEntry {
  name: string;
  content?: string;
  symlink?: boolean;
}

const S_IFLNK = 0o120000;

export function makeZip(entries: ZipEntry[]): Buffer {
  const files: Zippable = {};
  for (const entry of entries) {
    const data = new TextEncoder().encode(entry.content ?? `// ${entry.name}\n`);
    files[entry.name] = entry.symlink
      ? // Unix "made by" (os 3) with the symlink mode in the high 16 bits of the attributes.
        [data, { os: 3, attrs: ((S_IFLNK | 0o777) << 16) >>> 0 }]
      : data;
  }
  return Buffer.from(zipSync(files, { level: 6 }));
}

/**
 * Rewrites the central directory so every entry claims a tiny uncompressed
 * size, the shape of a zip bomb that lies about how big it will get.
 */
export function lieAboutSizes(zip: Buffer, claimedSize = 4): Buffer {
  const copy = Buffer.from(zip);
  for (let i = 0; i < copy.length - 4; i++) {
    if (copy.readUInt32LE(i) === 0x02014b50) copy.writeUInt32LE(claimedSize, i + 24);
  }
  return copy;
}

export function writeTempZip(data: Buffer): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "retrace-zip-"));
  const file = path.join(dir, "upload.zip");
  writeFileSync(file, data);
  return file;
}

export function tempDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), "retrace-out-"));
}

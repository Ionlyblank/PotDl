// Minimal zip reader built on the browser's own deflate support.

const END_OF_DIRECTORY = 0x06054b50;
const DIRECTORY_ENTRY = 0x02014b50;

export function isZip(bytes) {
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}

export function listZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  let end = bytes.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== END_OF_DIRECTORY) end--;
  if (end < 0) throw new Error("Not a valid zip file");

  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const entries = [];

  for (let i = 0; i < count; i++) {
    if (view.getUint32(offset, true) !== DIRECTORY_ENTRY) throw new Error("Corrupt zip directory");
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    entries.push({
      name: new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength)),
      method: view.getUint16(offset + 10, true),
      compressedSize: view.getUint32(offset + 20, true),
      headerOffset: view.getUint32(offset + 42, true),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

export async function readZipEntry(bytes, entry) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const nameLength = view.getUint16(entry.headerOffset + 26, true);
  const extraLength = view.getUint16(entry.headerOffset + 28, true);
  const start = entry.headerOffset + 30 + nameLength + extraLength;
  const data = bytes.subarray(start, start + entry.compressedSize);

  if (entry.method === 0) return data;
  if (entry.method !== 8) throw new Error(`Unsupported zip compression: ${entry.method}`);

  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

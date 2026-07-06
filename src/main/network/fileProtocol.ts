/**
 * Binary frame helpers for file chunk transmission.
 *
 * Wire format (all multi-byte integers are big-endian):
 *
 *   | offset | size | field           |
 *   |--------|------|-----------------|
 *   |      0 |   36 | fileId (UTF-8)  |  UUID string with dashes
 *   |     36 |    4 | chunkIndex (BE) |  uint32
 *   |     40 |    4 | totalChunks(BE) |  uint32
 *   |     44 | rest | chunk data      |  raw bytes
 */

export const FILE_CHUNK_HEADER_SIZE = 44
export const FILE_CHUNK_SIZE = 64 * 1024 // 64 KB per chunk

export function encodeFileChunk(
  fileId: string,
  index: number,
  total: number,
  data: Buffer
): Buffer {
  const header = Buffer.alloc(FILE_CHUNK_HEADER_SIZE)
  header.write(fileId, 0, 36, 'utf8')
  header.writeUInt32BE(index, 36)
  header.writeUInt32BE(total, 40)
  return Buffer.concat([header, data])
}

export function decodeFileChunk(
  buf: Buffer
): { fileId: string; index: number; total: number; data: Buffer } | null {
  if (buf.length < FILE_CHUNK_HEADER_SIZE) return null
  const fileId = buf.toString('utf8', 0, 36).replace(/\0+$/, '')
  const index = buf.readUInt32BE(36)
  const total = buf.readUInt32BE(40)
  const data = buf.subarray(FILE_CHUNK_HEADER_SIZE)
  return { fileId, index, total, data }
}

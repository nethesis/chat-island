// WebM/Opus (Chrome, Edge) to Ogg/Opus (RFC 7845) without re-encoding: the Acrobits app plays Ogg voice notes.

/** Read an EBML variable-length integer; `keepMarker` for element IDs. */
function vint(b: Uint8Array, at: number, keepMarker: boolean): { value: number; len: number; unknown: boolean } | null {
  const first = b[at]
  if (first === undefined) return null
  let len = 1
  while (len <= 8 && !(first & (0x80 >> (len - 1)))) len++
  if (len > 8 || at + len > b.length) return null
  let value = keepMarker ? first : first & (0xff >> len)
  let allOnes = value === (0xff >> len)
  for (let i = 1; i < len; i++) {
    value = value * 256 + b[at + i]
    if (b[at + i] !== 0xff) allOnes = false
  }
  return { value, len, unknown: !keepMarker && allOnes }
}

// WebM elements whose children are read in place (their size may be "unknown" while recording).
const MASTER = new Set([0x18538067 /* Segment */, 0x1f43b675 /* Cluster */, 0x1654ae6b /* Tracks */, 0xae /* TrackEntry */, 0xe1 /* Audio */, 0xa0 /* BlockGroup */])

interface Parsed {
  head?: Uint8Array // OpusHead from CodecPrivate
  channels: number
  packets: Uint8Array[]
}

function parseWebm(b: Uint8Array): Parsed {
  const out: Parsed = { channels: 1, packets: [] }
  let at = 0
  while (at < b.length) {
    const id = vint(b, at, true)
    if (!id) break
    const size = vint(b, at + id.len, false)
    if (!size) break
    const body = at + id.len + size.len
    if (MASTER.has(id.value)) {
      at = body // descend
      continue
    }
    if (size.unknown) break
    const end = Math.min(b.length, body + size.value)
    if (id.value === 0x63a2) out.head = b.slice(body, end) // CodecPrivate
    else if (id.value === 0x9f) out.channels = b[body] || 1 // Channels
    else if (id.value === 0xa3 || id.value === 0xa1) {
      // SimpleBlock / Block: track vint, 16-bit timecode, flags, then the frame (MediaRecorder does not lace)
      const track = vint(b, body, false)
      if (track) {
        const flags = b[body + track.len + 2]
        if (((flags >> 1) & 3) === 0) out.packets.push(b.slice(body + track.len + 3, end))
      }
    }
    at = end
  }
  return out
}

/** Samples at 48 kHz in one Opus packet (RFC 6716, section 3.1). */
export function opusSamples(p: Uint8Array): number {
  if (!p.length) return 0
  const toc = p[0]
  const config = toc >> 3
  let frameMs: number
  if (config < 12) frameMs = [10, 20, 40, 60][config % 4]
  else if (config < 16) frameMs = [10, 20][config % 2]
  else frameMs = [2.5, 5, 10, 20][config % 4]
  const code = toc & 3
  const frames = code === 0 ? 1 : code === 3 ? (p[1] ?? 0) & 0x3f : 2
  return Math.round(frames * frameMs * 48)
}

// Ogg's CRC32: polynomial 0x04c11db7, not reflected, initial value 0.
const CRC = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let r = i << 24
    for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1
    t[i] = r >>> 0
  }
  return t
})()

function crc(b: Uint8Array) {
  let c = 0
  for (let i = 0; i < b.length; i++) c = ((c << 8) ^ CRC[((c >>> 24) ^ b[i]) & 0xff]) >>> 0
  return c
}

function page(packets: Uint8Array[], granule: number, serial: number, seq: number, flags: number): Uint8Array {
  const lacing: number[] = []
  for (const p of packets) {
    let n = p.length
    while (n >= 255) {
      lacing.push(255)
      n -= 255
    }
    lacing.push(n)
  }
  const bodyLen = packets.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(27 + lacing.length + bodyLen)
  const v = new DataView(out.buffer)
  out.set([0x4f, 0x67, 0x67, 0x53], 0) // OggS
  out[5] = flags
  v.setUint32(6, granule % 0x100000000, true)
  v.setUint32(10, Math.floor(granule / 0x100000000), true)
  v.setUint32(14, serial, true)
  v.setUint32(18, seq, true)
  out[26] = lacing.length
  out.set(lacing, 27)
  let at = 27 + lacing.length
  for (const p of packets) {
    out.set(p, at)
    at += p.length
  }
  v.setUint32(22, crc(out), true)
  return out
}

function opusHead(channels: number): Uint8Array {
  const h = new Uint8Array(19)
  const v = new DataView(h.buffer)
  h.set(new TextEncoder().encode('OpusHead'), 0)
  h[8] = 1
  h[9] = channels
  v.setUint16(10, 312, true) // pre-skip, the usual encoder delay
  v.setUint32(12, 48000, true)
  return h
}

function opusTags(): Uint8Array {
  const vendor = new TextEncoder().encode('chat-island')
  const t = new Uint8Array(8 + 4 + vendor.length + 4)
  t.set(new TextEncoder().encode('OpusTags'), 0)
  new DataView(t.buffer).setUint32(8, vendor.length, true)
  t.set(vendor, 12)
  return t
}

/** WebM/Opus bytes to Ogg/Opus bytes; null when the input is not what MediaRecorder writes. */
export function webmOpusToOgg(webm: Uint8Array): Uint8Array<ArrayBuffer> | null {
  const { head, channels, packets } = parseWebm(webm)
  if (!packets.length) return null
  const isHead = head && head.length >= 19 && new TextDecoder().decode(head.slice(0, 8)) === 'OpusHead'
  const serial = (Math.random() * 0xffffffff) >>> 0
  const pages: Uint8Array[] = [page([isHead ? head! : opusHead(channels)], 0, serial, 0, 0x02), page([opusTags()], 0, serial, 1, 0)]
  let granule = 0
  let seq = 2
  // About a second per page (fifty 20 ms packets), and never more than 255 lacing values.
  for (let i = 0; i < packets.length; ) {
    const batch: Uint8Array[] = []
    let lacing = 0
    while (i < packets.length && batch.length < 50) {
      const need = Math.floor(packets[i].length / 255) + 1
      if (lacing + need > 255) break
      batch.push(packets[i])
      lacing += need
      granule += opusSamples(packets[i])
      i++
    }
    if (!batch.length) return null // a packet larger than one page can hold: not a voice note
    pages.push(page(batch, granule, serial, seq++, i >= packets.length ? 0x04 : 0))
  }
  const total = pages.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let at = 0
  for (const p of pages) {
    out.set(p, at)
    at += p.length
  }
  return out
}

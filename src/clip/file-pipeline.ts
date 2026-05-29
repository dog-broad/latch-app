import { encryptForRoom, decryptForRoom } from '@/crypto/client'
import { getFirestoreDb } from '@/firebase/firestore'
import { bytesToBase64, base64ToBytes } from '@/firebase/clips'

/**
 * file-clip pipeline. main-thread orchestration on top of the worker's
 * existing per-message encrypt / decrypt: split the file into 1 MiB
 * chunks, encrypt each with the chunk index in aad (so reorder gets
 * rejected on decrypt), upload each as a firestore document, and
 * record everything needed to retrieve and verify it later.
 *
 * the manifest is sha-256 of each plaintext chunk in hex — webcrypto
 * already authenticates ciphertext via the gcm tag, so the manifest is
 * a belt + suspenders guard against a (theoretical) compromise of the
 * key with intact tag forgery.
 *
 * the encrypted filename and mime live on the rtdb clip metadata, the
 * binary chunks live in firestore. neither side sees plaintext.
 */

export const FILE_CHUNK_SIZE = 1024 * 1024 // 1 MiB
export const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB cap per PROJECT spec

export type FileMetadata = {
  readonly fileId: string
  readonly encryptedName: string
  readonly encryptedMime: string
  readonly size: number
  readonly chunkCount: number
  readonly chunkPathPrefix: string
  readonly manifest: readonly string[]
}

export type UploadProgress = {
  readonly chunksUploaded: number
  readonly chunkCount: number
  readonly bytesUploaded: number
  readonly bytesTotal: number
}

function chunkIndexAad(index: number): Uint8Array {
  const aad = new Uint8Array(4)
  new DataView(aad.buffer).setUint32(0, index, false) // big-endian
  return aad
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))
  let s = ''
  for (const b of new Uint8Array(buf)) s += b.toString(16).padStart(2, '0')
  return s
}

export async function uploadFileClip(
  roomPath: string,
  keyId: number,
  file: File,
  onProgress?: (p: UploadProgress) => void,
): Promise<FileMetadata> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`file too large: ${file.size} bytes exceeds 10 MB cap`)
  }

  const buffer = new Uint8Array(await file.arrayBuffer())
  const chunkCount = Math.max(1, Math.ceil(buffer.length / FILE_CHUNK_SIZE))
  const fileId = crypto.randomUUID()
  const chunkPathPrefix = `rooms/${roomPath}/files/${fileId}/chunks`

  const enc = new TextEncoder()
  const [encryptedName, encryptedMime] = await Promise.all([
    encryptForRoom(keyId, enc.encode(file.name)),
    encryptForRoom(keyId, enc.encode(file.type || 'application/octet-stream')),
  ])

  const manifest: string[] = []
  const { doc, setDoc } = await import('firebase/firestore')
  const db = await getFirestoreDb()

  let bytesUploaded = 0
  for (let i = 0; i < chunkCount; i++) {
    const start = i * FILE_CHUNK_SIZE
    const end = Math.min(start + FILE_CHUNK_SIZE, buffer.length)
    const plaintext = buffer.subarray(start, end)
    manifest.push(await sha256Hex(plaintext))

    const payload = await encryptForRoom(keyId, plaintext, chunkIndexAad(i))
    await setDoc(doc(db, `${chunkPathPrefix}/${i}`), {
      payload: bytesToBase64(payload),
    })

    bytesUploaded += end - start
    onProgress?.({
      chunksUploaded: i + 1,
      chunkCount,
      bytesUploaded,
      bytesTotal: buffer.length,
    })
  }

  return {
    fileId,
    encryptedName: bytesToBase64(encryptedName),
    encryptedMime: bytesToBase64(encryptedMime),
    size: buffer.length,
    chunkCount,
    chunkPathPrefix,
    manifest,
  }
}

export async function decryptFileMetadata(
  meta: FileMetadata,
  keyId: number,
): Promise<{ name: string; mime: string }> {
  const dec = new TextDecoder()
  const [nameBytes, mimeBytes] = await Promise.all([
    decryptForRoom(keyId, base64ToBytes(meta.encryptedName)),
    decryptForRoom(keyId, base64ToBytes(meta.encryptedMime)),
  ])
  return { name: dec.decode(nameBytes), mime: dec.decode(mimeBytes) }
}

/**
 * pull every chunk from firestore, decrypt each (aad-bound to its
 * index, so reorders fail loud), verify each plaintext chunk against
 * the manifest, and concatenate. caller receives raw bytes — the ui
 * wraps in a Blob for object-url rendering.
 */
export async function downloadFileChunks(
  meta: FileMetadata,
  keyId: number,
): Promise<Uint8Array> {
  const { doc, getDoc } = await import('firebase/firestore')
  const db = await getFirestoreDb()

  const out = new Uint8Array(meta.size)
  let offset = 0
  for (let i = 0; i < meta.chunkCount; i++) {
    const snap = await getDoc(doc(db, `${meta.chunkPathPrefix}/${i}`))
    const data = snap.data() as { payload?: string } | undefined
    if (!data?.payload) {
      throw new Error(`missing chunk ${i}`)
    }
    const plaintext = await decryptForRoom(keyId, base64ToBytes(data.payload), chunkIndexAad(i))
    const expectedHash = meta.manifest[i]
    const actualHash = await sha256Hex(plaintext)
    if (expectedHash !== actualHash) {
      throw new Error(`manifest mismatch on chunk ${i}`)
    }
    out.set(plaintext, offset)
    offset += plaintext.length
  }
  return out
}

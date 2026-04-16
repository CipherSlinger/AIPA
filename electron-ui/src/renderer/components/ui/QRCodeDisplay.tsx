import React, { useEffect, useRef } from 'react'

/**
 * Minimal QR Code generator component.
 * Uses a pure-JS QR encoder (no npm dependency).
 * Only supports alphanumeric mode for short URLs (up to ~200 chars).
 */

// QR code data encoding tables
const EC_LEVEL = 1 // M (medium error correction)
const MODE_BYTE = 4

// Reed-Solomon GF(256) arithmetic
const GF_EXP = new Uint8Array(512)
const GF_LOG = new Uint8Array(256)
;(() => {
  let x = 1
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x
    GF_LOG[x] = i
    x = x << 1
    if (x & 256) x ^= 285
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255]
})()

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0
  return GF_EXP[GF_LOG[a] + GF_LOG[b]]
}

function polyMul(a: number[], b: number[]): number[] {
  const result = new Array(a.length + b.length - 1).fill(0)
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++)
      result[i + j] ^= gfMul(a[i], b[j])
  return result
}

function polyRemainder(dividend: number[], divisor: number[]): number[] {
  const result = [...dividend]
  for (let i = 0; i < dividend.length - divisor.length + 1; i++) {
    if (result[i] === 0) continue
    for (let j = 1; j < divisor.length; j++)
      result[i + j] ^= gfMul(divisor[j], result[i])
  }
  return result.slice(dividend.length - divisor.length + 1)
}

function getGeneratorPoly(degree: number): number[] {
  let g = [1]
  for (let i = 0; i < degree; i++)
    g = polyMul(g, [1, GF_EXP[i]])
  return g
}

// QR version/EC parameters (version 1-10, EC level M)
const VERSION_PARAMS: Record<number, { totalCodewords: number; ecPerBlock: number; groups: [number, number][] }> = {
  1:  { totalCodewords: 26,  ecPerBlock: 10, groups: [[1, 16]] },
  2:  { totalCodewords: 44,  ecPerBlock: 16, groups: [[1, 28]] },
  3:  { totalCodewords: 70,  ecPerBlock: 26, groups: [[1, 44]] },
  4:  { totalCodewords: 100, ecPerBlock: 18, groups: [[2, 32]] },
  5:  { totalCodewords: 134, ecPerBlock: 24, groups: [[2, 43]] },
  6:  { totalCodewords: 172, ecPerBlock: 16, groups: [[4, 27]] },
  7:  { totalCodewords: 196, ecPerBlock: 18, groups: [[4, 31]] },
  8:  { totalCodewords: 242, ecPerBlock: 22, groups: [[2, 38], [2, 39]] },
  9:  { totalCodewords: 292, ecPerBlock: 22, groups: [[3, 36], [2, 37]] },
  10: { totalCodewords: 346, ecPerBlock: 26, groups: [[4, 43], [1, 44]] },
}

function chooseVersion(dataLen: number): number {
  for (let v = 1; v <= 10; v++) {
    const p = VERSION_PARAMS[v]
    const dcCount = p.groups.reduce((s, [count, cw]) => s + count * cw, 0)
    // 4 bits mode + char count bits + data
    const charCountBits = v <= 9 ? 8 : 16
    const availBits = dcCount * 8
    const neededBits = 4 + charCountBits + dataLen * 8
    if (neededBits <= availBits) return v
  }
  return 10 // fallback
}

function encodeData(text: string, version: number): number[] {
  const params = VERSION_PARAMS[version]
  const charCountBits = version <= 9 ? 8 : 16
  const dcCount = params.groups.reduce((s, [count, cw]) => s + count * cw, 0)
  
  // Build bit stream
  const bits: number[] = []
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1)
  }
  
  pushBits(MODE_BYTE, 4) // byte mode
  pushBits(text.length, charCountBits)
  for (let i = 0; i < text.length; i++) pushBits(text.charCodeAt(i), 8)
  
  // Terminator
  const maxBits = dcCount * 8
  const termLen = Math.min(4, maxBits - bits.length)
  pushBits(0, termLen)
  
  // Pad to byte boundary
  while (bits.length % 8 !== 0) bits.push(0)
  
  // Pad bytes
  const padBytes = [0xEC, 0x11]
  let padIdx = 0
  while (bits.length < maxBits) {
    pushBits(padBytes[padIdx % 2], 8)
    padIdx++
  }
  
  // Convert bits to bytes
  const dataCodewords: number[] = []
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0
    for (let j = 0; j < 8; j++) byte = (byte << 1) | (bits[i + j] || 0)
    dataCodewords.push(byte)
  }
  
  // Split into blocks and compute EC
  const genPoly = getGeneratorPoly(params.ecPerBlock)
  const allDataBlocks: number[][] = []
  const allEcBlocks: number[][] = []
  let offset = 0
  
  for (const [blockCount, cwPerBlock] of params.groups) {
    for (let b = 0; b < blockCount; b++) {
      const block = dataCodewords.slice(offset, offset + cwPerBlock)
      offset += cwPerBlock
      allDataBlocks.push(block)
      
      const msgPoly = [...block, ...new Array(params.ecPerBlock).fill(0)]
      const ec = polyRemainder(msgPoly, genPoly)
      allEcBlocks.push(ec)
    }
  }
  
  // Interleave data blocks
  const result: number[] = []
  const maxDataLen = Math.max(...allDataBlocks.map(b => b.length))
  for (let i = 0; i < maxDataLen; i++)
    for (const block of allDataBlocks)
      if (i < block.length) result.push(block[i])
  
  // Interleave EC blocks
  for (let i = 0; i < params.ecPerBlock; i++)
    for (const block of allEcBlocks)
      result.push(block[i])
  
  return result
}

// Alignment pattern positions per version
const ALIGNMENT_POSITIONS: Record<number, number[]> = {
  2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 52],
}

function createMatrix(version: number, codewords: number[]): boolean[][] {
  const size = version * 4 + 17
  const matrix: (boolean | null)[][] = Array.from({ length: size }, () => Array(size).fill(null))
  const reserved: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false))
  
  // Place finder patterns
  const placeFinder = (row: number, col: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const mr = row + r, mc = col + c
        if (mr < 0 || mr >= size || mc < 0 || mc >= size) continue
        const isBlack = (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
                        (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
                        (r >= 2 && r <= 4 && c >= 2 && c <= 4)
        matrix[mr][mc] = isBlack
        reserved[mr][mc] = true
      }
    }
  }
  placeFinder(0, 0)
  placeFinder(0, size - 7)
  placeFinder(size - 7, 0)
  
  // Place alignment patterns
  if (version >= 2) {
    const positions = ALIGNMENT_POSITIONS[version]
    for (const r of positions) {
      for (const c of positions) {
        if (reserved[r][c]) continue
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const isBlack = Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0)
            matrix[r + dr][c + dc] = isBlack
            reserved[r + dr][c + dc] = true
          }
        }
      }
    }
  }
  
  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    if (!reserved[6][i]) { matrix[6][i] = i % 2 === 0; reserved[6][i] = true }
    if (!reserved[i][6]) { matrix[i][6] = i % 2 === 0; reserved[i][6] = true }
  }
  
  // Dark module
  matrix[size - 8][8] = true
  reserved[size - 8][8] = true
  
  // Reserve format info areas
  for (let i = 0; i < 15; i++) {
    // Horizontal
    const hc = i < 8 ? i : (i < 9 ? i + 1 : size - 15 + i)
    if (!reserved[8][hc]) reserved[8][hc] = true
    // Vertical
    const vr = i < 8 ? (size - 1 - i) : (i < 9 ? 15 - i : 14 - i)
    if (!reserved[vr][8]) reserved[vr][8] = true
  }
  
  // Place data
  const dataBits: number[] = []
  for (const cw of codewords) {
    for (let i = 7; i >= 0; i--) dataBits.push((cw >> i) & 1)
  }
  
  let bitIdx = 0
  let col = size - 1
  let upward = true
  
  while (col >= 0) {
    if (col === 6) col-- // skip timing column
    const rows = upward ? Array.from({ length: size }, (_, i) => size - 1 - i) : Array.from({ length: size }, (_, i) => i)
    for (const row of rows) {
      for (const dc of [0, -1]) {
        const c = col + dc
        if (c < 0 || c >= size || reserved[row][c]) continue
        matrix[row][c] = bitIdx < dataBits.length ? dataBits[bitIdx] === 1 : false
        bitIdx++
      }
    }
    col -= 2
    upward = !upward
  }
  
  // Apply mask pattern 0 (checkerboard: (row + col) % 2 === 0)
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!reserved[r][c] && (r + c) % 2 === 0) {
        matrix[r][c] = !matrix[r][c]
      }
    }
  }
  
  // Write format info (EC level M = 0, mask 0)
  // Pre-computed: EC=M(00), mask=0(000) -> format bits with BCH: 101010000010010
  const formatBits = [1,0,1,0,1,0,0,0,0,0,1,0,0,1,0]
  // XOR with mask: 101010000010010
  const formatMask = [1,0,1,0,1,0,0,0,0,0,1,0,0,1,0]
  const maskedFormat = formatBits.map((b, i) => b ^ formatMask[i])
  
  for (let i = 0; i < 15; i++) {
    const bit = maskedFormat[i] === 1
    // Horizontal
    const hc = i < 8 ? i : (i < 9 ? i + 1 : size - 15 + i)
    matrix[8][hc] = bit
    // Vertical  
    const vr = i < 8 ? (size - 1 - i) : (i < 9 ? 15 - i : 14 - i)
    matrix[vr][8] = bit
  }
  
  return matrix as boolean[][]
}

interface QRCodeDisplayProps {
  url: string
  size?: number
  label?: string
}

export default function QRCodeDisplay({ url, size = 160, label }: QRCodeDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const version = chooseVersion(url.length)
    const codewords = encodeData(url, version)
    const matrix = createMatrix(version, codewords)
    const moduleCount = matrix.length
    
    const scale = Math.floor(size / (moduleCount + 8)) // quiet zone of 4 modules each side
    const totalSize = (moduleCount + 8) * scale
    
    canvas.width = totalSize
    canvas.height = totalSize
    
    const ctx = canvas.getContext('2d')!
    // Background
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, totalSize, totalSize)
    
    // Modules
    ctx.fillStyle = '#000000'
    for (let r = 0; r < moduleCount; r++) {
      for (let c = 0; c < moduleCount; c++) {
        if (matrix[r][c]) {
          ctx.fillRect((c + 4) * scale, (r + 4) * scale, scale, scale)
        }
      }
    }
  }, [url, size])
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 16 }}>
      <canvas
        ref={canvasRef}
        style={{ width: size, height: size, borderRadius: 8, border: '2px solid var(--border)', background: '#fff', padding: 8 }}
      />
      {label && (
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center' }}>{label}</span>
      )}
    </div>
  )
}

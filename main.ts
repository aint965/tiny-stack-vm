// Tiny stack VM: faithful interpreter of make.fun's tiny stack ISA v1.
// One run answers every instance in MAKEFUN_INPUT_DIR: program.bin +
// input.bin in, stdout.bin + exit.txt out. All ten traps, both limits,
// and every hard rule (wrapping MUL, INT_MIN/-1, unsigned DIVU/MODU/LTU,
// shifts masked to 5 bits, PUSH8 sign extension, EXIT low byte, output
// kept before a trap) exactly as the reference VM defines them.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Opcode tables: immediate length (-1 = no such opcode), popped, pushed.
const IMM = new Int8Array(256).fill(-1);
const POP = new Int8Array(256);
const PSH = new Int8Array(256);
for (const [o, im, pp, pu] of [
  [0, 0, 0, 0], [1, 1, 0, 1], [2, 4, 0, 1], [3, 0, 1, 0],
  [4, 0, 1, 2], [5, 0, 2, 2], [6, 0, 2, 3], [7, 0, 3, 3],
  [16, 0, 2, 1], [17, 0, 2, 1], [18, 0, 2, 1], [19, 0, 2, 1],
  [20, 0, 2, 1], [21, 0, 2, 1], [22, 0, 2, 1], [23, 0, 1, 1],
  [24, 0, 2, 1], [25, 0, 2, 1], [26, 0, 2, 1], [27, 0, 1, 1],
  [28, 0, 2, 1], [29, 0, 2, 1], [30, 0, 2, 1], [32, 0, 2, 1],
  [33, 0, 2, 1], [34, 0, 2, 1], [48, 2, 0, 0], [49, 2, 1, 0],
  [50, 2, 1, 0], [51, 2, 0, 0], [52, 0, 0, 0], [64, 0, 1, 1],
  [65, 0, 2, 0], [80, 0, 1, 0], [81, 0, 1, 0], [82, 0, 0, 1],
  [83, 0, 1, 0],
]) { IMM[o] = im; POP[o] = pp; PSH[o] = pu; }

// Runs one program on its input. Returns [output bytes, exit code].
function run(p, inp) {
  const n = p.length;
  const s = new Int32Array(256);
  let sp = 0;
  const c = new Int32Array(64);
  let cp = 0;
  const m = new Int32Array(256);
  const o = new Uint8Array(65536);
  let ol = 0, ip = 0, pc = 0, st = 0;
  const end = (code) => [o.subarray(0, ol), code];
  for (;;) {
    if (st === 1000000) return end(10);
    if (pc < 0 || pc >= n) return end(9);
    const op = p[pc];
    const im = IMM[op];
    if (im < 0) return end(5);
    if (pc + im >= n) return end(9);
    st++;
    const nx = pc + 1 + im;
    const pp = POP[op];
    if (sp < pp) return end(2);
    if (sp - pp + PSH[op] > 256) return end(3);
    pc = nx;
    switch (op) {
      case 0: return end(0);
      case 1: s[sp++] = (p[nx - 1] << 24) >> 24; break;
      case 2: s[sp++] = p[nx - 4] | (p[nx - 3] << 8) | (p[nx - 2] << 16) | (p[nx - 1] << 24); break;
      case 3: sp--; break;
      case 4: s[sp] = s[sp - 1]; sp++; break;
      case 5: { const t = s[sp - 1]; s[sp - 1] = s[sp - 2]; s[sp - 2] = t; break; }
      case 6: s[sp] = s[sp - 2]; sp++; break;
      case 7: { const a = s[sp - 3]; s[sp - 3] = s[sp - 2]; s[sp - 2] = s[sp - 1]; s[sp - 1] = a; break; }
      case 23: s[sp - 1] = -s[sp - 1] | 0; break;
      case 27: s[sp - 1] = ~s[sp - 1]; break;
      case 16: case 17: case 18: case 19: case 20: case 21: case 22:
      case 24: case 25: case 26: case 28: case 29: case 30:
      case 32: case 33: case 34: {
        const b = s[sp - 1], a = s[sp - 2];
        let r = 0;
        if (op === 16) r = (a + b) | 0;
        else if (op === 17) r = (a - b) | 0;
        else if (op === 18) r = Math.imul(a, b);
        else if (op === 19) { if (!b) return end(4); r = (a / b) | 0; }
        else if (op === 20) { if (!b) return end(4); r = (a % b) | 0; }
        else if (op === 21) { if (!b) return end(4); r = Math.floor((a >>> 0) / (b >>> 0)) | 0; }
        else if (op === 22) { if (!b) return end(4); r = ((a >>> 0) % (b >>> 0)) | 0; }
        else if (op === 24) r = a & b;
        else if (op === 25) r = a | b;
        else if (op === 26) r = a ^ b;
        else if (op === 28) r = a << (b & 31);
        else if (op === 29) r = a >> (b & 31);
        else if (op === 30) r = (a >>> (b & 31)) | 0;
        else if (op === 32) r = a === b ? 1 : 0;
        else if (op === 33) r = a < b ? 1 : 0;
        else r = (a >>> 0) < (b >>> 0) ? 1 : 0;
        sp -= 2; s[sp++] = r; break;
      }
      case 48: case 49: case 50: {
        const rel = ((p[nx - 2] | (p[nx - 1] << 8)) << 16) >> 16;
        let take = op === 48;
        if (!take) { const v = s[--sp]; take = op === 49 ? v === 0 : v !== 0; }
        if (take) pc = nx + rel;
        break;
      }
      case 51:
        if (cp === 64) return end(7);
        c[cp++] = nx;
        pc = p[nx - 2] | (p[nx - 1] << 8);
        break;
      case 52:
        if (cp === 0) return end(8);
        pc = c[--cp];
        break;
      case 64: {
        const a = s[sp - 1];
        if (a < 0 || a > 255) return end(6);
        s[sp - 1] = m[a];
        break;
      }
      case 65: {
        const a = s[sp - 1];
        if (a < 0 || a > 255) return end(6);
        m[a] = s[sp - 2];
        sp -= 2;
        break;
      }
      case 80: {
        const t = String(s[sp - 1]);
        if (ol + t.length > 65536) return end(11);
        sp--;
        for (let i = 0; i < t.length; i++) o[ol++] = t.charCodeAt(i);
        break;
      }
      case 81:
        if (ol + 1 > 65536) return end(11);
        o[ol++] = s[--sp] & 255;
        break;
      case 82: s[sp++] = ip < inp.length ? inp[ip++] : -1; break;
      case 83: return end(s[--sp] & 255);
    }
  }
}

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(I).sort()) {
  const [out, code] = run(
    new Uint8Array(readFileSync(join(I, id, 'program.bin'))),
    new Uint8Array(readFileSync(join(I, id, 'input.bin'))),
  );
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), out);
  writeFileSync(join(O, id, 'exit.txt'), `${code}\n`);
}

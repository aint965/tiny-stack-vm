# Tiny stack VM — build report

Faithful interpreter of the tiny stack ISA v1, written from ISA.md and the
reference VM's semantics: opcode tables, per-step
checks in ISA order, wrapping 32-bit arithmetic, unsigned DIVU/MODU/LTU,
shifts masked to 5 bits, PUSH8 sign extension, EXIT low byte, output-limit
trap 11, output kept before traps.

## Verification (practice set, kit scorer)

- Entry: **score 1,000,000** — i001..i040 all 1000/1000, passed 1,
  answered 40/40.
- Baseline plain-vm 1.0.0: **670,000** (10 at 0, 2 at 200, 8 at 800).
  Beats the bar by 330,000.
- Determinism: two runs byte-identical; ~0.2–0.3 s for all 40 instances,
  far inside the 60 s wall.
- grade-local (process driver): 1,000,000, 40,000/40,000 points, L1
  regrade reproduced byte for byte (local Node v24 vs server v26).
- Size: main.ts 5,530 bytes (plain UTF-8); repo total under the 8,192
  cap (`git ls-files` before commit).

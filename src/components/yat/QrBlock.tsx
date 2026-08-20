/**
 * Simulated QR block. Deterministically derived from the pairing payload so
 * the same code always renders the same pattern. Encodes nothing sensitive.
 */
function hash(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const SIZE = 21;

function isFinder(row: number, col: number) {
  const inBox = (r0: number, c0: number) =>
    row >= r0 && row < r0 + 7 && col >= c0 && col < c0 + 7;
  return inBox(0, 0) || inBox(0, SIZE - 7) || inBox(SIZE - 7, 0);
}

function finderOn(row: number, col: number) {
  const r = row < 7 ? row : row - (SIZE - 7);
  const c = col < 7 ? col : col - (SIZE - 7);
  const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3));
  return ring !== 2;
}

export function QrBlock({ payload }: { payload: string }) {
  const seed = hash(payload);
  const cells: boolean[] = [];
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      if (isFinder(row, col)) {
        cells.push(finderOn(row, col));
      } else {
        const v = hash(`${seed}:${row}:${col}`);
        cells.push((v & 7) > 3);
      }
    }
  }

  return (
    <div
      role="img"
      aria-label="Pairing QR code"
      className="grid rounded-xl bg-card p-3"
      style={{ gridTemplateColumns: `repeat(${SIZE}, 1fr)`, width: 208, height: 208 }}
    >
      {cells.map((on, i) => (
        <span
          key={i}
          className={on ? "bg-foreground" : "bg-transparent"}
          style={{ aspectRatio: "1 / 1" }}
        />
      ))}
    </div>
  );
}

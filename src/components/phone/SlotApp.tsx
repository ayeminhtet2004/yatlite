import { useState } from "react";

const SYMBOLS = ["🍒", "🔔", "7️⃣", "⭐", "🍋"];

function spin() {
  return [0, 1, 2].map(() => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]!);
}

export function SlotApp({ onHome }: { onHome: () => void }) {
  const [reels, setReels] = useState<string[]>(["🍒", "🔔", "⭐"]);
  const [spinning, setSpinning] = useState(false);
  const [credits, setCredits] = useState(100);

  function play() {
    if (spinning || credits < 10) return;
    setSpinning(true);
    setCredits((c) => c - 10);
    const id = setInterval(() => setReels(spin()), 90);
    setTimeout(() => {
      clearInterval(id);
      const final = spin();
      setReels(final);
      if (final[0] === final[1] && final[1] === final[2]) setCredits((c) => c + 100);
      setSpinning(false);
    }, 1200);
  }

  return (
    <div className="flex flex-1 flex-col bg-[#1B1206]">
      <div className="flex items-center gap-3 bg-[#B7791F] px-5 py-4 text-white">
        <span className="text-xl" aria-hidden>
          🎰
        </span>
        <h1 className="text-base font-semibold">Lucky Slots</h1>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        <p className="text-[12px] font-semibold uppercase tracking-widest text-[#F2C879]">
          Credits {credits}
        </p>

        <div className="flex gap-3 rounded-2xl bg-[#2A1B08] px-5 py-6 shadow-inner">
          {reels.map((symbol, index) => (
            <span
              key={index}
              className={`flex h-[68px] w-[62px] items-center justify-center rounded-xl bg-[#F7E6C4] text-4xl ${
                spinning ? "animate-pulse" : ""
              }`}
            >
              {symbol}
            </span>
          ))}
        </div>

        <button
          type="button"
          onClick={play}
          disabled={spinning || credits < 10}
          className="h-[54px] w-full rounded-2xl bg-[#B7791F] text-[15px] font-semibold text-white disabled:opacity-60"
        >
          {spinning ? "Spinning…" : "Spin (10 credits)"}
        </button>

        <p className="text-[11px] text-[#F2C879]/80">
          Gambling / slot content — reported to your Guardian as a risk app.
        </p>
      </div>

      <div className="px-5 pb-5">
        <button
          type="button"
          onClick={onHome}
          className="h-[54px] w-full rounded-2xl border border-[#B7791F] text-[15px] font-semibold text-[#F2C879]"
        >
          Return Home
        </button>
      </div>
    </div>
  );
}

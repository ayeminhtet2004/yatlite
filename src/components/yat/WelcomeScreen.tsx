export function WelcomeScreen({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <div className="relative flex flex-1 flex-col overflow-x-hidden overflow-y-auto bg-[#F8F7FF]">
      {/* Decorative shapes (non-interactive) */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-16 h-56 w-56 rounded-[45%_55%_60%_40%/50%_45%_55%_50%] bg-primary/15"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-16 top-28 h-28 w-28 rounded-[55%_45%_40%_60%/45%_60%_40%_55%] bg-primary/25"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 bottom-24 h-60 w-60 rounded-[50%_50%_45%_55%/55%_40%_60%_45%] bg-primary/15"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-14 bottom-40 h-24 w-24 rounded-[45%_55%_55%_45%/50%_50%_50%_50%] bg-primary/25"
      />

      <div className="relative z-10 flex min-h-full flex-1 flex-col items-center px-6 pb-8 pt-14">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary text-4xl font-bold text-primary-foreground shadow-lg shadow-primary/25">
          Y
        </div>
        <h1 className="mt-4 text-[28px] font-bold tracking-tight text-primary">Yat Lite</h1>

        <h2 className="mt-8 text-center text-[30px] font-extrabold leading-tight tracking-tight text-foreground">
          Stop it,
          <br />
          For your future
        </h2>

        <p className="mt-4 max-w-[300px] text-center text-[14px] leading-relaxed text-[#737687]">
          Empower your family with safe, balanced, and mindful screen time habits.
        </p>

        <p className="mt-6 max-w-[300px] text-center text-[12.5px] leading-relaxed text-[#737687]">
          Allow notifications so Yat Lite can show controlled-device offline alerts in the
          notification bar and on the lock screen.
        </p>

        <div className="mt-auto w-full pt-10">
          <button
            type="button"
            onClick={onGetStarted}
            className="flex h-[60px] w-full items-center justify-center gap-2 rounded-[20px] bg-primary text-[16px] font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-transform active:scale-[0.98]"
          >
            Get Started <span aria-hidden>→</span>
          </button>
        </div>
      </div>
    </div>
  );
}

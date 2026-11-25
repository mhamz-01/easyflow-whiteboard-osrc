"use client";

// Animated loading skeleton matching the toolbar's pill-and-button layout — shown while the Fabric canvas initialises.

export function ToolbarSkeleton() {
  return (
    <div className="fixed bottom-4 md:bottom-6 left-0 right-0 z-50 flex flex-col items-center gap-2.5 px-4 pointer-events-none">
      <div className="w-full md:w-auto max-w-full">
        <div className="flex items-center gap-[3px] px-2 py-1.5 bg-[var(--wb-skeleton-bg)] border border-[var(--wb-toolbar-border)] rounded-[18px] w-fit overflow-hidden">

          <SkBtn delay={0} />
          <SkBtn delay={0.1} />
          <Sep />

          <SkBtn delay={0.15} />
          <SkBtn delay={0.2} />
          <SkBtn delay={0.25} />
          <SkBtn delay={0.3} />
          <SkBtn delay={0.35} />
          <SkBtn delay={0.4} />
          <SkBtn delay={0.45} />
          <SkBtn delay={0.5} />
          <Sep />

          <SkPill width={92} delay={0.55} labelWidth={44} />
          <div className="w-[3px]" />
          <SkPill width={106} delay={0.65} labelWidth={54} />
        </div>
      </div>

      {/* Mobile dots */}
      <div className="flex gap-[5px] items-center md:hidden">
        <div className="h-1 rounded-sm bg-white/55" style={{ animation: "sk-dot 2s ease-in-out infinite" }} />
        <div className="w-1 h-1 rounded-sm bg-white/15" />
      </div>

      <style>{`
        .sk-sweep {
          position: relative;
          background: var(--wb-tint-05);
          border-radius: 10px;
          flex-shrink: 0;
          overflow: hidden;
        }
        .sk-sweep::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(105deg,
            transparent 20%,
            var(--wb-tint-12) 50%,
            transparent 80%
          );
          animation: sk-sweep 2.4s ease-in-out infinite;
          animation-delay: var(--sk-d);
        }
        @keyframes sk-sweep {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
        @keyframes sk-dot {
          0%, 100% { width: 20px; opacity: 0.6; }
          50%       { width: 24px; opacity: 1;   }
        }
      `}</style>
    </div>
  );
}

function SkBtn({ delay }: { delay: number }) {
  return (
    <div
      className="sk-sweep w-9 h-9"
      style={{ "--sk-d": `${delay}s` } as React.CSSProperties}
    />
  );
}

function Sep() {
  return (
    <div className="hidden md:block w-px h-[22px] mx-[5px] flex-shrink-0"
      style={{ background: "linear-gradient(to bottom, transparent, var(--wb-tint-15), transparent)" }}
    />
  );
}

function SkPill({ width, delay, labelWidth }: { width: number; delay: number; labelWidth: number }) {
  return (
    <div
      className="sk-sweep relative flex items-center gap-[6px] px-[10px] flex-shrink-0"
      style={{ width, height: 36, "--sk-d": `${delay}s` } as React.CSSProperties}
    >
      <div className="w-[14px] h-[14px] rounded-[3px] bg-white/12 flex-shrink-0 z-10" />
      <div className="h-2 rounded bg-white/8 z-10" style={{ width: labelWidth }} />
    </div>
  );
}
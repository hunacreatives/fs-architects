import { useState } from 'react';
import { createPortal } from 'react-dom';

// macOS Dock-style hover label for the collapsed sidebar: a frosted glass
// pill that pops out beside the icon. Rendered position:fixed so the nav's
// overflow-y-auto can't clip it; keyed by label so the pop-in replays as the
// pointer moves between icons.
export function useSidebarTip(enabled: boolean) {
  const [tip, setTip] = useState<{ label: string; top: number; left: number } | null>(null);

  const bind = (label: string) =>
    enabled
      ? {
          onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
            const r = e.currentTarget.getBoundingClientRect();
            setTip({ label, top: r.top + r.height / 2, left: r.right + 14 });
          },
          onMouseLeave: () => setTip(null),
        }
      : {};

  // Portaled to <body>: rendered inside the sidebar it inherits the aside's
  // stacking context and paints behind (or clipped by) the main content panel.
  const tipEl = enabled && tip ? createPortal(
    <div
      key={tip.label}
      className="sidebar-tip fixed z-[70] pointer-events-none px-3 py-1.5 rounded-xl text-[12px] font-semibold text-gray-800 whitespace-nowrap"
      style={{
        top: tip.top,
        left: tip.left,
        background: 'rgba(255,255,255,0.88)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow: '0 8px 24px rgba(99,120,200,0.22), inset 0 1px 0 rgba(255,255,255,0.9)',
        border: '1px solid rgba(255,255,255,0.85)',
      }}
    >
      {tip.label}
      <span
        className="absolute right-full top-1/2 -translate-y-1/2 border-[5px] border-transparent"
        style={{ borderRightColor: 'rgba(255,255,255,0.92)' }}
      />
    </div>,
    document.body,
  ) : null;

  return { bind, tipEl, clearTip: () => setTip(null) };
}

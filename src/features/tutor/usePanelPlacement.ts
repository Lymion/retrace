"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Where the tutor panel sits: docked in the right pane, or floating over the
// code at a position the learner dragged it to. Remembered per browser in
// localStorage, which is a convenience only: the app works without it.

export interface Placement {
  floating: boolean;
  collapsed: boolean;
  x: number;
  y: number;
}

const KEY = "retrace.tutorPanel";
const DEFAULT: Placement = { floating: false, collapsed: false, x: 0, y: 0 };

function load(): Placement {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as Partial<Placement>;
    return {
      floating: Boolean(parsed.floating),
      collapsed: Boolean(parsed.collapsed),
      x: Number(parsed.x) || 0,
      y: Number(parsed.y) || 0,
    };
  } catch {
    return DEFAULT;
  }
}

function save(value: Placement) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Private windows and blocked storage: the panel just forgets its spot.
  }
}

export const PANEL_WIDTH = 420;
export const PANEL_HEIGHT = 560;
/** Below the top bar and the workspace toolbar, so the panel never hides the mode switch. */
const TOP_LIMIT = 100;

/** The floating panel's height: its normal size, or less on a short window. */
export function panelHeight(): number {
  if (typeof window === "undefined") return PANEL_HEIGHT;
  return Math.max(240, Math.min(PANEL_HEIGHT, window.innerHeight - 72));
}

/** Keeps the whole floating panel inside the window, below the top bar. */
function clamp(value: Placement): Placement {
  if (typeof window === "undefined") return value;
  return {
    ...value,
    x: Math.min(Math.max(8, value.x), Math.max(8, window.innerWidth - PANEL_WIDTH - 8)),
    y: Math.min(
      Math.max(TOP_LIMIT, value.y),
      Math.max(TOP_LIMIT, window.innerHeight - panelHeight() - 8),
    ),
  };
}

export function usePanelPlacement() {
  const [placement, setPlacement] = useState<Placement>(DEFAULT);
  const dragStart = useRef<{ pointerX: number; pointerY: number; x: number; y: number } | null>(
    null,
  );

  // Read the saved spot after mount; the server render always starts docked.
  useEffect(() => {
    const saved = load();
    const timer = window.setTimeout(() => setPlacement(clamp(saved)), 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Keep a floating panel on screen when the window gets smaller.
  useEffect(() => {
    const onResize = () => setPlacement((current) => clamp(current));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const update = useCallback((patch: Partial<Placement>) => {
    setPlacement((current) => {
      const next = clamp({ ...current, ...patch });
      save(next);
      return next;
    });
  }, []);

  const startDrag = useCallback(
    (event: React.PointerEvent) => {
      if (!placement.floating || event.button !== 0) return;
      dragStart.current = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        x: placement.x,
        y: placement.y,
      };
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    },
    [placement],
  );

  const moveDrag = useCallback(
    (event: React.PointerEvent) => {
      const start = dragStart.current;
      if (!start) return;
      update({
        x: start.x + event.clientX - start.pointerX,
        y: start.y + event.clientY - start.pointerY,
      });
    },
    [update],
  );

  const endDrag = useCallback(() => {
    dragStart.current = null;
  }, []);

  /** Arrow keys move a floating panel, so dragging works without a mouse too. */
  const keyMove = useCallback(
    (event: React.KeyboardEvent) => {
      if (!placement.floating) return;
      const step = event.shiftKey ? 40 : 10;
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const move = moves[event.key];
      if (!move) return;
      event.preventDefault();
      update({ x: placement.x + move[0], y: placement.y + move[1] });
    },
    [placement, update],
  );

  const toggleFloating = useCallback(() => {
    if (placement.floating) update({ floating: false });
    else
      update({
        floating: true,
        collapsed: false,
        x: window.innerWidth - PANEL_WIDTH - 24,
        y: TOP_LIMIT + 8,
      });
  }, [placement.floating, update]);

  return { placement, update, startDrag, moveDrag, endDrag, keyMove, toggleFloating };
}

import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { AtlasDocument } from "../types";

import {
  MAX_SCALE,
  MIN_SCALE,
  NODE_HEIGHT,
  NODE_WIDTH,
} from "./constants";
import type { AtlasLayout, AtlasPosition, ViewState } from "./types";

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  viewX: number;
  viewY: number;
};

export type PanZoomPointerHandlers = {
  onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onWheel: (event: ReactWheelEvent<HTMLDivElement>) => void;
};

export type PanZoomOptions = {
  layout?: AtlasLayout;
  atlas?: AtlasDocument;
  unlockedConceptIds?: ReadonlySet<string>;
  entryPosition?: AtlasPosition;
  runId?: string;
  onFocus?: (conceptId: string) => void;
};

export type PanZoomController = ReturnType<typeof usePanZoom>;

const EMPTY_LAYOUT: AtlasLayout = {
  width: 1400,
  height: 1000,
  positions: new Map(),
  modulePositions: new Map(),
};
const EMPTY_CONCEPT_IDS = new Set<string>();

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function usePanZoom(
  viewportRef: RefObject<HTMLDivElement | null>,
  initialView: ViewState,
  options?: PanZoomOptions,
) {
  const [view, setView] = useState<ViewState>(initialView);
  const [isPanning, setIsPanning] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  const {
    atlas,
    entryPosition,
    layout = EMPTY_LAYOUT,
    onFocus,
    runId,
    unlockedConceptIds = EMPTY_CONCEPT_IDS,
  } = options ?? {};

  const fitTo = useCallback((minimumScale = MIN_SCALE) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const centerPos = layout.positions.get('__center__');
    const ccx = centerPos ? centerPos.x + NODE_WIDTH / 2 : layout.width / 2;
    const ccy = centerPos ? centerPos.y + NODE_HEIGHT / 2 : layout.height / 2;
    // Find farthest edge distance from center node to any unlocked concept
    let maxDist = 300;
    atlas?.concepts.forEach(c => {
      if (!unlockedConceptIds.has(c.id)) return;
      const p = layout.positions.get(c.id);
      if (p) {
        maxDist = Math.max(maxDist,
          ccx - p.x,                    // left edge
          p.x + NODE_WIDTH - ccx,       // right edge
          ccy - p.y,                    // top edge
          p.y + NODE_HEIGHT - ccy,      // bottom edge
        );
      }
    });
    const needed = maxDist * 2 - 100;
    const scale = clamp(
      Math.min((viewport.clientWidth - 72) / needed, (viewport.clientHeight - 120) / needed),
      minimumScale, 1);
    setView({
      scale,
      x: viewport.clientWidth / 2 - ccx * scale + 100,
      y: viewport.clientHeight / 2 - ccy * scale + 20,
    });
  }, [atlas, layout, unlockedConceptIds, viewportRef]);

  const focusOn = useCallback(
    (conceptId: string, preferredScale = 0.9) => {
      const viewport = viewportRef.current;
      const position = layout.positions.get(conceptId);
      if (!viewport || !position) return;
      onFocus?.(conceptId);
      const scale = clamp(Math.max(view.scale, preferredScale), MIN_SCALE, MAX_SCALE);
      setView({
        scale,
        x: viewport.clientWidth / 2 - (position.x + NODE_WIDTH / 2) * scale,
        y: viewport.clientHeight / 2 - (position.y + NODE_HEIGHT / 2) * scale,
      });
    },
    [layout.positions, onFocus, view.scale, viewportRef],
  );

  const zoomBy = useCallback((factor: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const centerX = viewport.clientWidth / 2;
    const centerY = viewport.clientHeight / 2;
    setView((current) => {
      const scale = clamp(current.scale * factor, MIN_SCALE, MAX_SCALE);
      const worldX = (centerX - current.x) / current.scale;
      const worldY = (centerY - current.y) / current.scale;
      return { scale, x: centerX - worldX * scale, y: centerY - worldY * scale };
    });
  }, [viewportRef]);

  const handleWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    setView((current) => {
      const scale = clamp(current.scale * (event.deltaY > 0 ? 0.9 : 1.1), MIN_SCALE, MAX_SCALE);
      const worldX = (pointerX - current.x) / current.scale;
      const worldY = (pointerY - current.y) / current.scale;
      return { scale, x: pointerX - worldX * scale, y: pointerY - worldY * scale };
    });
  }, []);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as Element).closest("button, a, input, summary, [role='button']")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      viewX: view.x,
      viewY: view.y,
    };
    setIsPanning(true);
  }, [view.x, view.y]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setView((current) => ({
      ...current,
      x: drag.viewX + event.clientX - drag.startX,
      y: drag.viewY + event.clientY - drag.startY,
    }));
  }, []);

  const endPan = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setIsPanning(false);
  }, []);

  useEffect(() => {
    if (!entryPosition) return;
    function centerEntryPoint() {
      const viewport = viewportRef.current;
      if (!viewport || !entryPosition) return;
      const scale = 1.14;
      setView({
        scale,
        x: viewport.clientWidth / 2 - (entryPosition.x + NODE_WIDTH / 2) * scale,
        y: viewport.clientHeight / 2 - (entryPosition.y + NODE_HEIGHT / 2) * scale + 26,
      });
    }
    let frame = requestAnimationFrame(centerEntryPoint);
    let lastW = window.innerWidth, lastH = window.innerHeight;
    function recenterAfterResize() {
      const dw = Math.abs(window.innerWidth - lastW);
      const dh = Math.abs(window.innerHeight - lastH);
      lastW = window.innerWidth; lastH = window.innerHeight;
      if (dw < 30 && dh < 30) return; // ignore small changes (Alt key menu bar)
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(centerEntryPoint);
    }
    window.addEventListener("resize", recenterAfterResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", recenterAfterResize);
    };
  }, [entryPosition?.x, entryPosition?.y, runId, viewportRef]);

  const pointerHandlers = useMemo<PanZoomPointerHandlers>(() => ({
    onPointerCancel: endPan,
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: endPan,
    onWheel: handleWheel,
  }), [endPan, handlePointerDown, handlePointerMove, handleWheel]);

  return { view, isPanning, pointerHandlers, zoomBy, fitTo, focusOn };
}

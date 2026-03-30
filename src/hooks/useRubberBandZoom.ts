import { useEffect, useRef } from 'react';

interface RubberBandZoomOptions {
  maxScale?: number;
  minScale?: number;
  wheelSensitivity?: number;
  /** 0-1 lerp factor per frame for the spring-back animation */
  snapBackSpeed?: number;
  /** ms of inactivity before wheel-triggered snap-back begins */
  snapBackDelay?: number;
  enabled?: boolean;
}

export function useRubberBandZoom(
  containerRef: React.RefObject<HTMLDivElement | null>,
  options: RubberBandZoomOptions = {}
) {
  const {
    maxScale = 1.35,
    minScale = 0.85,
    wheelSensitivity = 0.0015,
    snapBackSpeed = 0.09,
    snapBackDelay = 120,
    enabled = true,
  } = options;

  const scaleRef = useRef(1);
  const originRef = useRef({ x: 0, y: 0 });
  const snapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animFrameRef = useRef<number>(0);
  const isSnappingRef = useRef(false);
  const isPinchingRef = useRef(false);
  const basePinchDistRef = useRef(0);
  const basePinchScaleRef = useRef(1);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled) return;

    const apply = () => {
      el.style.transformOrigin = `${originRef.current.x}px ${originRef.current.y}px`;
      el.style.transform = `scale(${scaleRef.current})`;
    };

    const clear = () => {
      scaleRef.current = 1;
      el.style.transform = '';
      el.style.transformOrigin = '';
    };

    const startSnap = () => {
      if (isSnappingRef.current) return;
      isSnappingRef.current = true;

      const tick = () => {
        const diff = 1 - scaleRef.current;
        if (Math.abs(diff) < 0.002) {
          clear();
          isSnappingRef.current = false;
          return;
        }
        scaleRef.current += diff * snapBackSpeed;
        apply();
        animFrameRef.current = requestAnimationFrame(tick);
      };
      animFrameRef.current = requestAnimationFrame(tick);
    };

    const cancelSnap = () => {
      if (isSnappingRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        isSnappingRef.current = false;
      }
      if (snapTimerRef.current) {
        clearTimeout(snapTimerRef.current);
        snapTimerRef.current = null;
      }
    };

    const scheduleSnap = () => {
      if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
      snapTimerRef.current = setTimeout(startSnap, snapBackDelay);
    };

    const clamp = (v: number) => Math.max(minScale, Math.min(maxScale, v));

    // ── Wheel (mouse wheel + trackpad scroll/pinch) ──
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cancelSnap();
      scaleRef.current = clamp(scaleRef.current + -e.deltaY * wheelSensitivity);
      originRef.current = { x: e.clientX, y: e.clientY };
      apply();
      scheduleSnap();
    };

    // ── Touch pinch ──
    const dist = (t: TouchList) =>
      Math.hypot(t[1].clientX - t[0].clientX, t[1].clientY - t[0].clientY);

    const center = (t: TouchList) => ({
      x: (t[0].clientX + t[1].clientX) / 2,
      y: (t[0].clientY + t[1].clientY) / 2,
    });

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length < 2) return;
      cancelSnap();
      isPinchingRef.current = true;
      basePinchDistRef.current = dist(e.touches);
      basePinchScaleRef.current = scaleRef.current;
      originRef.current = center(e.touches);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isPinchingRef.current || e.touches.length < 2) return;
      e.preventDefault();
      const ratio = dist(e.touches) / basePinchDistRef.current;
      scaleRef.current = clamp(basePinchScaleRef.current * ratio);
      originRef.current = center(e.touches);
      apply();
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (isPinchingRef.current && e.touches.length < 2) {
        isPinchingRef.current = false;
        startSnap();
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      cancelSnap();
      clear();
    };
  }, [containerRef, enabled, maxScale, minScale, wheelSensitivity, snapBackSpeed, snapBackDelay]);

  return { isPinching: isPinchingRef };
}

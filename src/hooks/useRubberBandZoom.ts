import { useEffect, useRef, useCallback } from 'react';

interface RubberBandZoomOptions {
  maxScale?: number;
  minScale?: number;
  wheelSensitivity?: number;
  /** 0-1 lerp factor per frame for the spring-back animation */
  snapBackSpeed?: number;
  /** ms of inactivity before wheel-triggered snap-back begins */
  snapBackDelay?: number;
  enabled?: boolean;
  /** Fired once when the user zooms past maxScale; use to trigger lightbox etc. */
  onExceedMax?: () => void;
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
    onExceedMax,
  } = options;

  const isPinchingRef = useRef(false);
  const onExceedMaxRef = useRef(onExceedMax);
  onExceedMaxRef.current = onExceedMax;

  const apiRef = useRef({
    pinchStart(_touches: TouchList) {},
    pinchMove(_touches: TouchList) {},
    pinchEnd() {},
  });

  useEffect(() => {
    if (!enabled) {
      apiRef.current = {
        pinchStart() {},
        pinchMove() {},
        pinchEnd() {},
      };
      return;
    }

    const getEl = () => containerRef.current;

    let scale = 1;
    let originX = 0;
    let originY = 0;
    let isSnapping = false;
    let animFrame = 0;
    let snapTimer: ReturnType<typeof setTimeout> | null = null;
    let basePinchDist = 0;
    let basePinchScale = 1;
    let exceededFired = false;

    const clamp = (v: number) => Math.max(minScale, Math.min(maxScale, v));

    const apply = () => {
      const el = getEl();
      if (!el) return;
      el.style.transformOrigin = `${originX}px ${originY}px`;
      el.style.transform = `scale(${scale})`;
    };

    const clear = () => {
      scale = 1;
      const el = getEl();
      if (el) {
        el.style.transform = '';
        el.style.transformOrigin = '';
      }
    };

    const startSnap = () => {
      if (isSnapping) return;
      isSnapping = true;
      const tick = () => {
        const diff = 1 - scale;
        if (Math.abs(diff) < 0.002) {
          clear();
          isSnapping = false;
          exceededFired = false;
          return;
        }
        scale += diff * snapBackSpeed;
        apply();
        animFrame = requestAnimationFrame(tick);
      };
      animFrame = requestAnimationFrame(tick);
    };

    const cancelSnap = () => {
      if (isSnapping) {
        cancelAnimationFrame(animFrame);
        isSnapping = false;
      }
      if (snapTimer) {
        clearTimeout(snapTimer);
        snapTimer = null;
      }
    };

    const onWheel = (e: WheelEvent) => {
      const el = getEl();
      if (!el) return;
      const target = e.target as Node | null;
      if (!el.contains(target)) return;
      e.preventDefault();
      cancelSnap();
      const unclamped = scale + -e.deltaY * wheelSensitivity;
      scale = clamp(unclamped);
      if (unclamped > maxScale && !exceededFired && onExceedMaxRef.current) {
        exceededFired = true;
        onExceedMaxRef.current();
        startSnap();
        return;
      }
      originX = e.clientX;
      originY = e.clientY;
      apply();
      if (snapTimer) clearTimeout(snapTimer);
      snapTimer = setTimeout(startSnap, snapBackDelay);
    };

    window.addEventListener('wheel', onWheel, { passive: false });

    const dist = (t: TouchList) =>
      Math.hypot(t[1].clientX - t[0].clientX, t[1].clientY - t[0].clientY);

    const center = (t: TouchList) => ({
      x: (t[0].clientX + t[1].clientX) / 2,
      y: (t[0].clientY + t[1].clientY) / 2,
    });

    apiRef.current = {
      pinchStart(touches: TouchList) {
        cancelSnap();
        isPinchingRef.current = true;
        basePinchDist = dist(touches);
        basePinchScale = scale;
        const c = center(touches);
        originX = c.x;
        originY = c.y;
      },
      pinchMove(touches: TouchList) {
        if (!isPinchingRef.current || touches.length < 2) return;
        const ratio = dist(touches) / basePinchDist;
        const unclamped = basePinchScale * ratio;
        scale = clamp(unclamped);
        if (unclamped > maxScale && !exceededFired && onExceedMaxRef.current) {
          exceededFired = true;
          isPinchingRef.current = false;
          onExceedMaxRef.current();
          startSnap();
          return;
        }
        const c = center(touches);
        originX = c.x;
        originY = c.y;
        apply();
      },
      pinchEnd() {
        if (!isPinchingRef.current) return;
        isPinchingRef.current = false;
        startSnap();
      },
    };

    return () => {
      window.removeEventListener('wheel', onWheel);
      cancelSnap();
      clear();
      apiRef.current = {
        pinchStart() {},
        pinchMove() {},
        pinchEnd() {},
      };
    };
  }, [containerRef, enabled, maxScale, minScale, wheelSensitivity, snapBackSpeed, snapBackDelay]);

  const pinchStart = useCallback((t: TouchList) => apiRef.current.pinchStart(t), []);
  const pinchMove = useCallback((t: TouchList) => apiRef.current.pinchMove(t), []);
  const pinchEnd = useCallback(() => apiRef.current.pinchEnd(), []);

  return { isPinching: isPinchingRef, pinchStart, pinchMove, pinchEnd };
}

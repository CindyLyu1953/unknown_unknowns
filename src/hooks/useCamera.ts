import { useRef, useCallback } from 'react';

export interface Camera {
  x: number; // world X at canvas center
  y: number; // world Y at canvas center
  zoom: number;
}

const ZOOM_MIN = 0.1;
const ZOOM_MAX = 6;

export function useCamera(initial: Camera) {
  const camera = useRef<Camera>({ ...initial });
  const flightFrame = useRef<number | null>(null);

  const cancelFlight = useCallback(() => {
    if (flightFrame.current !== null) cancelAnimationFrame(flightFrame.current);
    flightFrame.current = null;
  }, []);

  const worldToScreen = useCallback(
    (wx: number, wy: number, W: number, H: number): [number, number] => {
      const cam = camera.current;
      return [
        (wx - cam.x) * cam.zoom + W / 2,
        (wy - cam.y) * cam.zoom + H / 2,
      ];
    },
    []
  );

  const screenToWorld = useCallback((sx: number, sy: number, W: number, H: number): [number, number] => {
    const cam = camera.current;
    return [
      (sx - W / 2) / cam.zoom + cam.x,
      (sy - H / 2) / cam.zoom + cam.y,
    ];
  }, []);

  const pan = useCallback((dx: number, dy: number) => {
    camera.current.x -= dx / camera.current.zoom;
    camera.current.y -= dy / camera.current.zoom;
  }, []);

  const zoomAt = useCallback((sx: number, sy: number, W: number, H: number, factor: number) => {
    const cam = camera.current;
    const [wx, wy] = [(sx - W / 2) / cam.zoom + cam.x, (sy - H / 2) / cam.zoom + cam.y];
    const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, cam.zoom * factor));
    cam.x = wx - (sx - W / 2) / newZoom;
    cam.y = wy - (sy - H / 2) / newZoom;
    cam.zoom = newZoom;
  }, []);

  const flyTo = useCallback((wx: number, wy: number, targetZoom: number, onDone?: () => void) => {
    cancelFlight();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      camera.current = { x: wx, y: wy, zoom: Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, targetZoom)) };
      onDone?.();
      return;
    }
    const start = { ...camera.current };
    const end = { x: wx, y: wy, zoom: Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, targetZoom)) };
    const duration = 800;
    const startTime = performance.now();

    function ease(t: number) {
      return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }

    function step(now: number) {
      const t = Math.min(1, (now - startTime) / duration);
      const e = ease(t);
      camera.current.x = start.x + (end.x - start.x) * e;
      camera.current.y = start.y + (end.y - start.y) * e;
      camera.current.zoom = start.zoom + (end.zoom - start.zoom) * e;
      if (t < 1) flightFrame.current = requestAnimationFrame(step);
      else {
        flightFrame.current = null;
        onDone?.();
      }
    }
    flightFrame.current = requestAnimationFrame(step);
  }, [cancelFlight]);

  const reset = useCallback(() => {
    flyTo(initial.x, initial.y, initial.zoom);
  }, [flyTo, initial.x, initial.y, initial.zoom]);

  return { camera, worldToScreen, screenToWorld, pan, zoomAt, flyTo, reset, cancelFlight };
}

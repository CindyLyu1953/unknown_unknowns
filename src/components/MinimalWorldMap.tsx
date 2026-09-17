import { useCallback, useEffect, useRef, useState } from 'react';
import { concepts, conceptMap, CONTINENT_META, TERRAIN_CONTINENTS, WORLD } from '../data/concepts';
import type { Concept } from '../data/concepts';
import { useCamera } from '../hooks/useCamera';
import type { KnowledgeRoute } from '../navigation/route-engine';

interface Props {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onOpen: (id: string) => void;
  focusId: string | null;
  onFocused: () => void;
  route: KnowledgeRoute | null;
  leftInset?: number;
}

const CENTER = { x: WORLD.w / 2, y: WORLD.h / 2 };
const REGION_COLORS = {
  foundations: { fill: '#e9f7ee', stroke: '#89c69d', label: '#276749' },
  computation: { fill: '#eaf2ff', stroke: '#8bb5ed', label: '#245ea8' },
  modeling: { fill: '#f3edff', stroke: '#b79ae5', label: '#6941a5' },
  decisions: { fill: '#fff5dd', stroke: '#e2b75f', label: '#8a5a00' },
  central: { fill: '#f1f3f5', stroke: '#8c959f', label: '#24292f' },
} as const;

function pathMultiPolygon(ctx: CanvasRenderingContext2D, polygons: number[][][][]) {
  ctx.beginPath();
  for (const polygon of polygons) for (const ring of polygon) {
    if (!ring.length) continue;
    ctx.moveTo(ring[0][0], ring[0][1]);
    for (let index = 1; index < ring.length; index += 1) ctx.lineTo(ring[index][0], ring[index][1]);
    ctx.closePath();
  }
}

function titleCase(value: string) {
  return value.split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' ');
}

export default function MinimalWorldMap({ selectedId, onSelect, onOpen, focusId, onFocused, route, leftInset = 0 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const sizeRef = useRef({ width: 1, height: 1, dpr: 1 });
  const dragging = useRef(false);
  const dragged = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const clickMemory = useRef<{ id: string; time: number } | null>(null);
  const [cursor, setCursor] = useState('grab');
  const { camera, worldToScreen, pan, zoomAt, flyTo, reset, cancelFlight } = useCamera({ x: CENTER.x, y: CENTER.y, zoom: 0.16 });

  useEffect(() => {
    if (!focusId) return;
    const concept = conceptMap.get(focusId);
    if (concept) flyTo(concept.x - leftInset / Math.max(camera.current.zoom, 1) / 2, concept.y, Math.max(camera.current.zoom, 1.15), onFocused);
  }, [camera, flyTo, focusId, leftInset, onFocused]);

  const routeKey = route?.conceptIds.join('>') ?? '';
  useEffect(() => {
    if (!route || route.conceptIds.length < 2) return;
    const nodes = route.conceptIds.map(id => conceptMap.get(id)).filter(Boolean) as Concept[];
    if (nodes.length < 2) return;
    const minX = Math.min(...nodes.map(node => node.x));
    const maxX = Math.max(...nodes.map(node => node.x));
    const minY = Math.min(...nodes.map(node => node.y));
    const maxY = Math.max(...nodes.map(node => node.y));
    const { width, height } = sizeRef.current;
    const usableWidth = Math.max(420, width - leftInset - 120);
    const targetZoom = Math.max(0.18, Math.min(1.5, Math.min(usableWidth / Math.max(520, maxX - minX), (height - 180) / Math.max(380, maxY - minY))));
    flyTo((minX + maxX) / 2 - leftInset / targetZoom / 2, (minY + maxY) / 2, targetZoom);
  }, [flyTo, leftInset, routeKey]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const { width: W, height: H, dpr } = sizeRef.current;
    const cam = camera.current;
    const routeIds = route?.conceptIds ?? [];
    const routeSet = new Set(routeIds);
    const selected = selectedId ? conceptMap.get(selectedId) : null;
    const left = cam.x - W / cam.zoom / 2 - 180 / cam.zoom;
    const right = cam.x + W / cam.zoom / 2 + 180 / cam.zoom;
    const top = cam.y - H / cam.zoom / 2 - 180 / cam.zoom;
    const bottom = cam.y + H / cam.zoom / 2 + 180 / cam.zoom;
    const visible = concepts.filter(c => c.x >= left && c.x <= right && c.y >= top && c.y <= bottom);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#f6f8fa';
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(dpr * cam.zoom, 0, 0, dpr * cam.zoom, dpr * (W / 2 - cam.x * cam.zoom), dpr * (H / 2 - cam.y * cam.zoom));

    ctx.strokeStyle = '#d8dee4';
    ctx.lineWidth = 1 / cam.zoom;
    for (let x = 0; x <= WORLD.w; x += WORLD.tile) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD.h); ctx.stroke(); }
    for (let y = 0; y <= WORLD.h; y += WORLD.tile) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD.w, y); ctx.stroke(); }

    for (const continent of TERRAIN_CONTINENTS) {
      const palette = REGION_COLORS[continent.id];
      pathMultiPolygon(ctx, continent.coastline);
      ctx.fillStyle = palette.fill;
      ctx.fill('evenodd');
      ctx.strokeStyle = palette.stroke;
      ctx.lineWidth = 2.5 / cam.zoom;
      ctx.stroke();
      if (cam.zoom > 0.28) {
        for (const region of continent.regions) {
          ctx.beginPath();
          const ring = region.polygon;
          if (!ring.length) continue;
          ctx.moveTo(ring[0][0], ring[0][1]);
          for (let i = 1; i < ring.length; i += 1) ctx.lineTo(ring[i][0], ring[i][1]);
          ctx.closePath();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2 / cam.zoom;
          ctx.stroke();
        }
      }
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (cam.zoom < 0.62) {
      for (const continent of TERRAIN_CONTINENTS) {
        const palette = REGION_COLORS[continent.id];
        ctx.font = `600 ${Math.max(46, 19 / cam.zoom)}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
        ctx.fillStyle = palette.label;
        ctx.fillText(continent.name, continent.cx, continent.cy);
        ctx.font = `400 ${Math.max(22, 9 / cam.zoom)}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
        ctx.fillStyle = '#57606a';
        ctx.fillText(continent.subtitle, continent.cx, continent.cy + Math.max(58, 25 / cam.zoom));
      }
    } else if (cam.zoom < 1.15) {
      for (const continent of TERRAIN_CONTINENTS) for (const region of continent.regions) {
        ctx.font = `600 ${12 / cam.zoom}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
        ctx.fillStyle = '#57606a';
        ctx.fillText(titleCase(region.id), region.seed[0], region.seed[1]);
      }
    }

    if (cam.zoom > 0.42 && !route) {
      for (const concept of visible) for (const prerequisiteId of concept.prerequisites) {
        const prereq = conceptMap.get(prerequisiteId);
        if (!prereq) continue;
        const active = selectedId === concept.id || selectedId === prereq.id;
        if (!active && cam.zoom < 0.9) continue;
        ctx.beginPath(); ctx.moveTo(prereq.x, prereq.y); ctx.lineTo(concept.x, concept.y);
        ctx.strokeStyle = active ? '#0969da' : '#afb8c1';
        ctx.lineWidth = (active ? 3 : 1.2) / cam.zoom;
        ctx.stroke();
      }
    }

    if (route) for (const step of route.steps) {
      const from = conceptMap.get(step.fromId); const to = conceptMap.get(step.toId);
      if (!from || !to) continue;
      const hierarchy = step.kind === 'zoom_out' || step.kind === 'enter_detail';
      ctx.save();
      ctx.lineCap = 'round';
      ctx.setLineDash(hierarchy ? [11 / cam.zoom, 7 / cam.zoom] : []);
      ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 9 / cam.zoom; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y);
      ctx.strokeStyle = step.kind === 'review_foundation' ? '#1a7f37' : '#0969da'; ctx.lineWidth = 5 / cam.zoom; ctx.stroke();
      ctx.restore();
    }

    const shown = visible.filter(c => routeSet.has(c.id) || c.importance === 1 || (c.importance === 2 && cam.zoom > 0.42) || (c.importance === 3 && cam.zoom > 0.82));
    for (const concept of shown) {
      const onRoute = routeSet.has(concept.id);
      const connected = Boolean(selected && (concept.prerequisites.includes(selected.id) || selected.prerequisites.includes(concept.id) || concept.parents.includes(selected.id) || selected.parents.includes(concept.id)));
      const palette = REGION_COLORS[concept.continent];
      const radius = (concept.importance === 1 ? 7 : concept.importance === 2 ? 5 : 3.5) / cam.zoom;
      ctx.globalAlpha = route && !onRoute ? 0.22 : 1;
      ctx.beginPath(); ctx.arc(concept.x, concept.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = concept.id === selectedId ? '#0969da' : onRoute ? '#ffffff' : '#ffffff';
      ctx.strokeStyle = concept.id === selectedId || connected || onRoute ? '#0969da' : palette.stroke;
      ctx.lineWidth = (concept.id === selectedId || onRoute ? 3 : 1.5) / cam.zoom;
      ctx.fill(); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (route) routeIds.forEach((id, index) => {
      const concept = conceptMap.get(id); if (!concept) return;
      const radius = 13 / cam.zoom;
      ctx.beginPath(); ctx.arc(concept.x, concept.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = index === 0 ? '#1a7f37' : index === routeIds.length - 1 ? '#bf8700' : '#0969da';
      ctx.fill(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3 / cam.zoom; ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.font = `700 ${11 / cam.zoom}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      ctx.fillText(String(index + 1), concept.x, concept.y + 0.5 / cam.zoom);
    });

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const occupied: Array<{ x: number; y: number; w: number; h: number }> = [];
    for (const concept of [...shown].sort((a, b) => a.importance - b.importance)) {
      const onRoute = routeSet.has(concept.id); const active = concept.id === selectedId;
      if (route && !onRoute && !active) continue;
      if (!onRoute && !active && concept.importance === 2 && cam.zoom < 0.62) continue;
      if (!onRoute && !active && concept.importance === 3 && cam.zoom < 1.05) continue;
      const [x, y] = worldToScreen(concept.x, concept.y, W, H);
      const fontSize = active || onRoute ? 15 : concept.importance === 1 ? 14 : 13;
      ctx.font = `${active || onRoute ? 600 : 500} ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      const width = ctx.measureText(concept.name).width;
      const box = { x: x + 12, y: y - 13, w: width + 14, h: 26 };
      if (!active && !onRoute && occupied.some(o => box.x < o.x + o.w + 6 && box.x + box.w + 6 > o.x && box.y < o.y + o.h + 4 && box.y + box.h + 4 > o.y)) continue;
      ctx.fillStyle = 'rgba(255,255,255,0.94)';
      ctx.beginPath(); ctx.roundRect(box.x, box.y, box.w, box.h, 6); ctx.fill();
      ctx.strokeStyle = active || onRoute ? '#0969da' : '#d0d7de'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = active ? '#0969da' : '#24292f'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(concept.name, box.x + 7, box.y + 13);
      occupied.push(box);
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#57606a'; ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(`${shown.length} places visible · ${Math.round(cam.zoom * 100)}%`, 20, H - 18);
    frameRef.current = requestAnimationFrame(render);
  }, [camera, route, selectedId, worldToScreen]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect(); const dpr = Math.min(window.devicePixelRatio || 1, 2);
      sizeRef.current = { width: rect.width, height: rect.height, dpr };
      canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr);
    };
    const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
    frameRef.current = requestAnimationFrame(render);
    return () => { observer.disconnect(); cancelAnimationFrame(frameRef.current); };
  }, [render]);

  const point = useCallback((x: number, y: number) => {
    const rect = canvasRef.current?.getBoundingClientRect(); return { x: x - (rect?.left ?? 0), y: y - (rect?.top ?? 0) };
  }, []);
  const find = useCallback((x: number, y: number) => {
    const p = point(x, y); const { width, height } = sizeRef.current; let match: Concept | null = null; let distance = 22;
    for (const concept of concepts) {
      if (concept.importance === 2 && camera.current.zoom < 0.42) continue;
      if (concept.importance === 3 && camera.current.zoom < 0.82) continue;
      const [sx, sy] = worldToScreen(concept.x, concept.y, width, height); const d = Math.hypot(p.x - sx, p.y - sy);
      if (d < distance) { distance = d; match = concept; }
    }
    return match;
  }, [camera, point, worldToScreen]);

  const handleWheel = useCallback((event: WheelEvent) => {
    event.preventDefault(); cancelFlight(); const p = point(event.clientX, event.clientY); const { width, height } = sizeRef.current;
    zoomAt(p.x, p.y, width, height, event.deltaY < 0 ? 1.13 : 0.885);
  }, [cancelFlight, point, zoomAt]);
  useEffect(() => { const canvas = canvasRef.current; if (!canvas) return; canvas.addEventListener('wheel', handleWheel, { passive: false }); return () => canvas.removeEventListener('wheel', handleWheel); }, [handleWheel]);

  const zoomCenter = (factor: number) => { const { width, height } = sizeRef.current; zoomAt(width / 2, height / 2, width, height, factor); };
  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" style={{ cursor, background: '#f6f8fa' }} aria-label="Interactive minimal map of 440 data science concepts" onPointerDown={event => { cancelFlight(); event.currentTarget.setPointerCapture(event.pointerId); dragging.current = true; dragged.current = false; dragStart.current = { x: event.clientX, y: event.clientY }; }} onPointerMove={event => {
        if (!dragging.current) { setCursor(find(event.clientX, event.clientY) ? 'pointer' : 'grab'); return; }
        const dx = event.clientX - dragStart.current.x; const dy = event.clientY - dragStart.current.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) dragged.current = true;
        pan(dx, dy); dragStart.current = { x: event.clientX, y: event.clientY }; setCursor('grabbing');
      }} onPointerUp={event => {
        dragging.current = false; setCursor('grab'); if (dragged.current) return;
        const concept = find(event.clientX, event.clientY); const now = Date.now();
        if (!concept) { onSelect(null); clickMemory.current = null; return; }
        if (clickMemory.current?.id === concept.id && now - clickMemory.current.time < 420) { onOpen(concept.id); flyTo(concept.x, concept.y, Math.max(camera.current.zoom, 1.25)); clickMemory.current = null; }
        else { onSelect(concept.id); clickMemory.current = { id: concept.id, time: now }; }
      }} onPointerCancel={() => { dragging.current = false; setCursor('grab'); }} />
      <div className="minimal-map-controls" aria-label="Map controls">
        <button type="button" aria-label="Zoom in" onClick={() => zoomCenter(1.3)}>+</button>
        <button type="button" aria-label="Zoom out" onClick={() => zoomCenter(0.77)}>−</button>
        <button type="button" aria-label="Reset map view" onClick={reset}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 11a8 8 0 1 1 2.2 5.5M4 11V5m0 6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { concepts, conceptMap, CONCEPT_CLUSTERS, clusterMap, WORLD } from '../data/concepts';
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

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function splitLabel(ctx: CanvasRenderingContext2D, label: string, maxWidth: number) {
  if (ctx.measureText(label).width <= maxWidth) return [label];
  const words = label.split(' ');
  let first = '';
  let second = '';
  for (const word of words) {
    const candidate = first ? `${first} ${word}` : word;
    if (!second && ctx.measureText(candidate).width <= maxWidth) first = candidate;
    else second = second ? `${second} ${word}` : word;
  }
  return second ? [first, second] : [first];
}

export default function ConceptClusterGraph({ selectedId, onSelect, onOpen, focusId, onFocused, route, leftInset = 0 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const sizeRef = useRef({ width: 1, height: 1, dpr: 1 });
  const dragging = useRef(false);
  const dragged = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const clickMemory = useRef<{ id: string; time: number } | null>(null);
  const [cursor, setCursor] = useState('grab');
  const { camera, worldToScreen, pan, zoomAt, flyTo, reset, cancelFlight } = useCamera({ x: CENTER.x, y: CENTER.y, zoom: 0.245 });

  useEffect(() => {
    if (!focusId) return;
    const concept = conceptMap.get(focusId);
    if (concept) flyTo(concept.x - leftInset / 2, concept.y, Math.max(camera.current.zoom, 1.1), onFocused);
  }, [camera, flyTo, focusId, leftInset, onFocused]);

  const routeKey = route?.conceptIds.join('>') ?? '';
  useEffect(() => {
    if (!route || route.conceptIds.length < 2) return;
    const nodes = route.conceptIds.map(id => conceptMap.get(id)).filter(Boolean) as Concept[];
    const minX = Math.min(...nodes.map(node => node.x)); const maxX = Math.max(...nodes.map(node => node.x));
    const minY = Math.min(...nodes.map(node => node.y)); const maxY = Math.max(...nodes.map(node => node.y));
    const { width, height } = sizeRef.current;
    const availableWidth = Math.max(420, width - leftInset - 240);
    const targetZoom = Math.max(0.28, Math.min(1.5, Math.min(availableWidth / Math.max(480, maxX - minX), (height - 170) / Math.max(360, maxY - minY))));
    flyTo((minX + maxX) / 2 - leftInset / targetZoom / 2, (minY + maxY) / 2, targetZoom);
  }, [flyTo, leftInset, routeKey]);

  const render = useCallback(() => {
    const canvas = canvasRef.current; const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const { width: W, height: H, dpr } = sizeRef.current; const cam = camera.current;
    const routeIds = route?.conceptIds ?? []; const routeSet = new Set(routeIds);
    const selected = selectedId ? conceptMap.get(selectedId) : null;
    const worldLeft = cam.x - W / cam.zoom / 2 - 160 / cam.zoom; const worldRight = cam.x + W / cam.zoom / 2 + 160 / cam.zoom;
    const worldTop = cam.y - H / cam.zoom / 2 - 160 / cam.zoom; const worldBottom = cam.y + H / cam.zoom / 2 + 160 / cam.zoom;
    const visible = concepts.filter(concept => concept.x >= worldLeft && concept.x <= worldRight && concept.y >= worldTop && concept.y <= worldBottom);

    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#f6f8fa'; ctx.fillRect(0, 0, W, H);
    ctx.setTransform(dpr * cam.zoom, 0, 0, dpr * cam.zoom, dpr * (W / 2 - cam.x * cam.zoom), dpr * (H / 2 - cam.y * cam.zoom));

    for (const cluster of CONCEPT_CLUSTERS) {
      const x = cluster.x - cluster.width / 2; const y = cluster.y - cluster.height / 2;
      roundedRect(ctx, x, y, cluster.width, cluster.height, Math.min(36, 12 / cam.zoom));
      ctx.fillStyle = cluster.surface; ctx.fill();
      ctx.strokeStyle = `${cluster.color}55`; ctx.lineWidth = 1.5 / cam.zoom; ctx.stroke();
      ctx.fillStyle = cluster.color; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      const clusterFontSize = Math.min(44, 16 / cam.zoom);
      ctx.font = `650 ${clusterFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      const clusterLines = splitLabel(ctx, cluster.name, cluster.width - 56);
      clusterLines.forEach((line, index) => ctx.fillText(line, x + 28, y + 24 + index * clusterFontSize * 1.08));
      if (cam.zoom >= .38) {
        ctx.fillStyle = '#57606a'; ctx.font = `400 ${Math.min(30, 12 / cam.zoom)}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
        ctx.fillText(cluster.description, x + 28, y + 28 + clusterLines.length * clusterFontSize * 1.08);
        const count = concepts.filter(concept => concept.clusterId === cluster.id && concept.id !== 'data-science').length;
        ctx.textAlign = 'right'; ctx.fillText(`${count} concepts`, x + cluster.width - 28, y + 28);
      }
    }

    if (!route && cam.zoom > 0.62 && selected) {
      const neighbors = new Set([...selected.prerequisites, ...selected.unlocks, ...selected.parents, ...selected.children]);
      for (const id of neighbors) {
        const neighbor = conceptMap.get(id); if (!neighbor) continue;
        ctx.beginPath(); ctx.moveTo(selected.x, selected.y); ctx.lineTo(neighbor.x, neighbor.y);
        ctx.strokeStyle = '#0969da'; ctx.globalAlpha = .32; ctx.lineWidth = 2 / cam.zoom; ctx.stroke(); ctx.globalAlpha = 1;
      }
    }

    if (route) for (const step of route.steps) {
      const from = conceptMap.get(step.fromId); const to = conceptMap.get(step.toId); if (!from || !to) continue;
      const hierarchy = step.kind === 'zoom_out' || step.kind === 'enter_detail';
      ctx.save(); ctx.lineCap = 'round'; ctx.setLineDash(hierarchy ? [10 / cam.zoom, 7 / cam.zoom] : []);
      ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.strokeStyle = '#fff'; ctx.lineWidth = 9 / cam.zoom; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.strokeStyle = step.kind === 'review_foundation' ? '#1a7f37' : '#0969da'; ctx.lineWidth = 5 / cam.zoom; ctx.stroke();
      ctx.restore();
    }

    const shown = visible.filter(concept => routeSet.has(concept.id) || concept.importance === 1 || (concept.importance === 2 && cam.zoom >= .48) || (concept.importance === 3 && cam.zoom >= .78));
    for (const concept of shown) {
      const cluster = clusterMap.get(concept.clusterId)!; const active = concept.id === selectedId; const onRoute = routeSet.has(concept.id);
      const connected = Boolean(selected && (selected.prerequisites.includes(concept.id) || selected.unlocks.includes(concept.id) || selected.parents.includes(concept.id) || selected.children.includes(concept.id)));
      ctx.globalAlpha = route && !onRoute ? .18 : 1;
      ctx.beginPath(); ctx.arc(concept.x, concept.y, (active || onRoute ? 8 : concept.importance === 1 ? 6 : 4.5) / cam.zoom, 0, Math.PI * 2);
      ctx.fillStyle = active ? '#0969da' : '#fff'; ctx.strokeStyle = active || connected || onRoute ? '#0969da' : cluster.color;
      ctx.lineWidth = (active || onRoute ? 3 : 1.5) / cam.zoom; ctx.fill(); ctx.stroke(); ctx.globalAlpha = 1;
    }

    if (route) routeIds.forEach((id, index) => {
      const concept = conceptMap.get(id); if (!concept) return;
      ctx.beginPath(); ctx.arc(concept.x, concept.y, 14 / cam.zoom, 0, Math.PI * 2);
      ctx.fillStyle = index === 0 ? '#1a7f37' : index === routeIds.length - 1 ? '#bf8700' : '#0969da'; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3 / cam.zoom; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = `700 ${11 / cam.zoom}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(index + 1), concept.x, concept.y);
    });

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const occupied: Array<{ x: number; y: number; width: number; height: number }> = [];
    for (const concept of [...shown].sort((a, b) => a.importance - b.importance)) {
      const active = concept.id === selectedId; const onRoute = routeSet.has(concept.id);
      if (route && !active && !onRoute) continue;
      if (cam.zoom < .42 && !active && !onRoute && concept.id !== 'data-science') continue;
      if (!active && !onRoute && concept.importance === 2 && cam.zoom < .6) continue;
      if (!active && !onRoute && concept.importance === 3 && cam.zoom < .86) continue;
      const [x, y] = worldToScreen(concept.x, concept.y, W, H);
      const fontSize = active || onRoute ? 15 : 13;
      ctx.font = `${active || onRoute || concept.importance === 1 ? 600 : 500} ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      const lines = splitLabel(ctx, concept.name, 132); const width = Math.max(...lines.map(line => ctx.measureText(line).width)) + 14; const height = lines.length * 16 + 8;
      const box = { x: x - width / 2, y: y + 11, width, height };
      const collision = occupied.some(item => box.x < item.x + item.width + 4 && box.x + box.width + 4 > item.x && box.y < item.y + item.height + 4 && box.y + box.height + 4 > item.y);
      if (collision && !active && !onRoute) continue;
      roundedRect(ctx, box.x, box.y, box.width, box.height, 6); ctx.fillStyle = 'rgba(255,255,255,.96)'; ctx.fill();
      ctx.strokeStyle = active || onRoute ? '#0969da' : '#d0d7de'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = active ? '#0969da' : '#24292f'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      lines.forEach((line, index) => ctx.fillText(line, x, box.y + 4 + index * 16)); occupied.push(box);
    }

    ctx.fillStyle = '#57606a'; ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(`${shown.length} concepts visible · ${Math.round(cam.zoom * 100)}%`, 20, H - 18);
    frameRef.current = requestAnimationFrame(render);
  }, [camera, route, selectedId, worldToScreen]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const resize = () => { const rect = canvas.getBoundingClientRect(); const dpr = Math.min(window.devicePixelRatio || 1, 2); sizeRef.current = { width: rect.width, height: rect.height, dpr }; canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr); };
    const observer = new ResizeObserver(resize); observer.observe(canvas); resize(); frameRef.current = requestAnimationFrame(render);
    return () => { observer.disconnect(); cancelAnimationFrame(frameRef.current); };
  }, [render]);

  const localPoint = useCallback((clientX: number, clientY: number) => { const rect = canvasRef.current?.getBoundingClientRect(); return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) }; }, []);
  const findConcept = useCallback((clientX: number, clientY: number) => {
    const point = localPoint(clientX, clientY); const { width, height } = sizeRef.current; let result: Concept | null = null; let closest = 24;
    for (const concept of concepts) {
      if (concept.importance === 2 && camera.current.zoom < .48) continue;
      if (concept.importance === 3 && camera.current.zoom < .78) continue;
      const [x, y] = worldToScreen(concept.x, concept.y, width, height); const distance = Math.hypot(point.x - x, point.y - y);
      if (distance < closest) { closest = distance; result = concept; }
    }
    return result;
  }, [camera, localPoint, worldToScreen]);

  const handleWheel = useCallback((event: WheelEvent) => { event.preventDefault(); cancelFlight(); const point = localPoint(event.clientX, event.clientY); const { width, height } = sizeRef.current; zoomAt(point.x, point.y, width, height, event.deltaY < 0 ? 1.13 : .885); }, [cancelFlight, localPoint, zoomAt]);
  useEffect(() => { const canvas = canvasRef.current; if (!canvas) return; canvas.addEventListener('wheel', handleWheel, { passive: false }); return () => canvas.removeEventListener('wheel', handleWheel); }, [handleWheel]);
  const zoomCenter = (factor: number) => { const { width, height } = sizeRef.current; zoomAt(width / 2, height / 2, width, height, factor); };

  return <div className="relative h-full w-full">
    <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" style={{ cursor, background: '#f6f8fa' }} aria-label="Interactive clustered graph of 440 data science concepts" onPointerDown={event => { cancelFlight(); event.currentTarget.setPointerCapture(event.pointerId); dragging.current = true; dragged.current = false; dragStart.current = { x: event.clientX, y: event.clientY }; }} onPointerMove={event => {
      if (!dragging.current) { setCursor(findConcept(event.clientX, event.clientY) ? 'pointer' : 'grab'); return; }
      const dx = event.clientX - dragStart.current.x; const dy = event.clientY - dragStart.current.y; if (Math.abs(dx) + Math.abs(dy) > 3) dragged.current = true; pan(dx, dy); dragStart.current = { x: event.clientX, y: event.clientY }; setCursor('grabbing');
    }} onPointerUp={event => {
      dragging.current = false; setCursor('grab'); if (dragged.current) return; const concept = findConcept(event.clientX, event.clientY); const now = Date.now();
      if (!concept) { onSelect(null); clickMemory.current = null; return; }
      if (clickMemory.current?.id === concept.id && now - clickMemory.current.time < 420) { onOpen(concept.id); flyTo(concept.x, concept.y, Math.max(camera.current.zoom, 1.18)); clickMemory.current = null; }
      else { onSelect(concept.id); clickMemory.current = { id: concept.id, time: now }; }
    }} onPointerCancel={() => { dragging.current = false; setCursor('grab'); }} />
    <div className="graph-controls" aria-label="Graph controls">
      <button type="button" aria-label="Zoom in" onClick={() => zoomCenter(1.3)}>+</button>
      <button type="button" aria-label="Zoom out" onClick={() => zoomCenter(.77)}>−</button>
      <button type="button" aria-label="Reset graph view" onClick={reset}><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 11a8 8 0 1 1 2.2 5.5M4 11V5m0 6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
    </div>
  </div>;
}

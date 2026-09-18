import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { concepts, conceptMap, clusterMap } from '../data/concepts';
import type { Concept } from '../data/concepts';
import { useCamera } from '../hooks/useCamera';
import type { KnowledgeRoute } from '../navigation/route-engine';

type RelationshipKind = 'prerequisite' | 'part_of' | 'related';
type Position = { x: number; y: number };
type VisibleEdge = { source: string; target: string; kind: RelationshipKind };

interface Props {
  rootId: string | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onOpen: (id: string) => void;
  focusId: string | null;
  onFocused: () => void;
  route: KnowledgeRoute | null;
  revealLimit: number;
  onRevealMore: () => void;
  leftInset?: number;
}

function relatedIds(concept: Concept) {
  return [...new Set([...concept.prerequisites, ...concept.parents, ...concept.children, ...concept.unlocks])];
}

function buildNeighborhood(rootId: string, limit: number) {
  const root = conceptMap.get(rootId);
  if (!root) return [];
  const direct = relatedIds(root).filter(id => conceptMap.has(id));
  const directSet = new Set(direct);
  const second = direct.flatMap(id => {
    const concept = conceptMap.get(id);
    return concept ? relatedIds(concept) : [];
  }).filter(id => id !== rootId && !directSet.has(id) && conceptMap.has(id));
  const orderedSecond = [...new Set(second)].sort((a, b) => {
    const left = conceptMap.get(a)!; const right = conceptMap.get(b)!;
    return left.importance - right.importance || left.name.localeCompare(right.name);
  });
  return [rootId, ...direct, ...orderedSecond].slice(0, limit);
}

function layoutNeighborhood(rootId: string, ids: string[]) {
  const root = conceptMap.get(rootId)!;
  const directSet = new Set(relatedIds(root));
  const positions = new Map<string, Position>([[rootId, { x: 0, y: 0 }]]);
  const direct = ids.filter(id => directSet.has(id));
  const directRadius = Math.max(300, direct.length * 96 / Math.PI);
  direct.forEach((id, index) => {
    const angle = -Math.PI / 2 + index / Math.max(1, direct.length) * Math.PI * 2;
    positions.set(id, { x: Math.cos(angle) * directRadius, y: Math.sin(angle) * directRadius });
  });
  const outer = ids.filter(id => id !== rootId && !directSet.has(id));
  const outerRadius = Math.max(directRadius + 260, outer.length * 100 / Math.PI);
  outer.forEach((id, index) => {
    const angle = -Math.PI / 2 + index / Math.max(1, outer.length) * Math.PI * 2;
    positions.set(id, { x: Math.cos(angle) * outerRadius, y: Math.sin(angle) * outerRadius });
  });
  return positions;
}

function visibleEdges(ids: string[]) {
  const visible = new Set(ids);
  const edges: VisibleEdge[] = [];
  for (const id of ids) {
    const concept = conceptMap.get(id);
    if (!concept) continue;
    concept.prerequisites.forEach(source => { if (visible.has(source)) edges.push({ source, target: id, kind: 'prerequisite' }); });
    concept.parents.forEach(parent => { if (visible.has(parent)) edges.push({ source: id, target: parent, kind: 'part_of' }); });
  }
  return edges;
}

function drawEdge(ctx: CanvasRenderingContext2D, from: Position, to: Position, kind: RelationshipKind, zoom: number, strong: boolean) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const startRadius = 20 / zoom; const endRadius = 20 / zoom;
  const start = { x: from.x + Math.cos(angle) * startRadius, y: from.y + Math.sin(angle) * startRadius };
  const end = { x: to.x - Math.cos(angle) * endRadius, y: to.y - Math.sin(angle) * endRadius };
  ctx.save();
  ctx.strokeStyle = strong ? '#1c8c78' : kind === 'prerequisite' ? '#74ad9d' : kind === 'related' ? '#6f76a8' : '#a6b8b1';
  ctx.globalAlpha = strong ? 1 : .72;
  ctx.lineWidth = (strong ? 2.5 : 1.3) / zoom;
  ctx.setLineDash(kind === 'part_of' ? [5 / zoom, 5 / zoom] : kind === 'related' ? [2 / zoom, 5 / zoom] : []);
  ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke();
  if (kind === 'prerequisite') {
    const size = 7 / zoom;
    ctx.setLineDash([]); ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - Math.cos(angle - .52) * size, end.y - Math.sin(angle - .52) * size);
    ctx.lineTo(end.x - Math.cos(angle + .52) * size, end.y - Math.sin(angle + .52) * size); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

export default function LocalConceptGraph({ rootId, selectedId, onSelect, onOpen, focusId, onFocused, route, revealLimit, onRevealMore, leftInset = 0 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const sizeRef = useRef({ width: 1, height: 1, dpr: 1 });
  const dragging = useRef(false); const dragged = useRef(false); const dragStart = useRef({ x: 0, y: 0 });
  const clickMemory = useRef<{ id: string; time: number } | null>(null);
  const lastReveal = useRef(0);
  const [cursor, setCursor] = useState('grab');
  const { camera, worldToScreen, pan, zoomAt, flyTo, reset, cancelFlight } = useCamera({ x: 0, y: 0, zoom: .48 });

  const root = rootId ? conceptMap.get(rootId) ?? null : null;
  const neighborhoodIds = useMemo(() => rootId ? buildNeighborhood(rootId, revealLimit) : [], [rootId, revealLimit]);
  const allNearbyCount = useMemo(() => rootId ? buildNeighborhood(rootId, 42).length : 0, [rootId]);
  const displayIds = route?.conceptIds ?? neighborhoodIds;
  const positions = useMemo(() => {
    if (route) return new Map(route.conceptIds.map((id, index) => [id, { x: (index - (route.conceptIds.length - 1) / 2) * 230, y: 0 }]));
    return rootId ? layoutNeighborhood(rootId, neighborhoodIds) : new Map<string, Position>();
  }, [neighborhoodIds, rootId, route]);
  const edges = useMemo(() => route ? route.steps.map(step => ({
    source: step.fromId,
    target: step.toId,
    kind: step.kind === 'concept_bridge' ? 'related' as const : step.kind === 'zoom_out' || step.kind === 'enter_detail' ? 'part_of' as const : 'prerequisite' as const,
  })) : visibleEdges(displayIds), [displayIds, route]);

  useEffect(() => { if (rootId) flyTo(-leftInset / 2, 0, .48); }, [flyTo, leftInset, rootId]);
  useEffect(() => {
    if (!focusId) return;
    const position = positions.get(focusId);
    if (position) flyTo(position.x - leftInset / 2, position.y, Math.max(camera.current.zoom, 1), onFocused);
    else onFocused();
  }, [camera, flyTo, focusId, leftInset, onFocused, positions]);

  const render = useCallback(() => {
    const canvas = canvasRef.current; const ctx = canvas?.getContext('2d'); if (!canvas || !ctx) return;
    const { width: W, height: H, dpr } = sizeRef.current; const zoom = camera.current.zoom;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#f7f8f3'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#a8b8b120';
    for (let x = 12; x < W; x += 25) for (let y = 12; y < H; y += 25) { ctx.beginPath(); ctx.arc(x, y, .8, 0, Math.PI * 2); ctx.fill(); }
    if (!root) { frameRef.current = requestAnimationFrame(render); return; }
    ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * (W / 2 - camera.current.x * zoom), dpr * (H / 2 - camera.current.y * zoom));

    const routePairs = new Set(route?.steps.map(step => `${step.fromId}>${step.toId}`) ?? []);
    edges.forEach(edge => {
      const from = positions.get(edge.source); const to = positions.get(edge.target); if (!from || !to) return;
      drawEdge(ctx, from, to, edge.kind, zoom, routePairs.has(`${edge.source}>${edge.target}`) || routePairs.has(`${edge.target}>${edge.source}`));
    });

    displayIds.forEach((id, index) => {
      const concept = conceptMap.get(id); const position = positions.get(id); if (!concept || !position) return;
      const isRoot = !route && id === rootId; const selected = id === selectedId; const onRoute = Boolean(route);
      const cluster = clusterMap.get(concept.clusterId)!;
      ctx.save(); ctx.translate(position.x, position.y);
      const radius = (isRoot ? 30 : onRoute ? 20 : 17) / zoom;
      ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fillStyle = isRoot ? '#163e35' : selected ? '#1c8c78' : '#fcfdf9';
      ctx.strokeStyle = selected || isRoot ? '#1c8c78' : cluster.color;
      ctx.lineWidth = (selected || isRoot ? 3 : 1.5) / zoom;
      ctx.shadowColor = 'rgba(30,70,55,.13)'; ctx.shadowBlur = 12 / zoom; ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
      if (route) {
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-radius * .72, -radius * .72, 10 / zoom, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#0969da'; ctx.font = `700 ${10 / zoom}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(index + 1), -radius * .72, -radius * .72);
      }
      ctx.restore();

      const [sx, sy] = worldToScreen(position.x, position.y, W, H);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const fontSize = Math.max(isRoot ? 16 : 14, Math.min(isRoot ? 22 : 20, (isRoot ? 16 : 14) * zoom));
      const labelHeight = fontSize + 14;
      ctx.font = `${isRoot || selected ? 650 : 550} ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      const textWidth = Math.min(230, ctx.measureText(concept.name).width + 20);
      const labelY = sy + (isRoot ? 39 : 27);
      ctx.beginPath(); ctx.roundRect(sx - textWidth / 2, labelY, textWidth, labelHeight, 7);
      ctx.fillStyle = isRoot ? '#163e35' : 'rgba(255,255,255,.97)'; ctx.fill();
      ctx.strokeStyle = selected ? '#1c8c78' : '#d7dfd9'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = isRoot ? '#fff' : '#172622'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const label = concept.name.length > 27 ? `${concept.name.slice(0, 25)}…` : concept.name;
      ctx.fillText(label, sx, labelY + labelHeight / 2);
      ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * (W / 2 - camera.current.x * zoom), dpr * (H / 2 - camera.current.y * zoom));
    });

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    frameRef.current = requestAnimationFrame(render);
  }, [camera, displayIds, edges, positions, root, rootId, route, selectedId, worldToScreen]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const resize = () => { const rect = canvas.getBoundingClientRect(); const dpr = Math.min(window.devicePixelRatio || 1, 2); sizeRef.current = { width: rect.width, height: rect.height, dpr }; canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr); };
    const observer = new ResizeObserver(resize); observer.observe(canvas); resize(); frameRef.current = requestAnimationFrame(render);
    return () => { observer.disconnect(); cancelAnimationFrame(frameRef.current); };
  }, [render]);

  const localPoint = useCallback((clientX: number, clientY: number) => { const rect = canvasRef.current?.getBoundingClientRect(); return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) }; }, []);
  const findConcept = useCallback((clientX: number, clientY: number) => {
    const point = localPoint(clientX, clientY); const { width, height } = sizeRef.current; let match: string | null = null; let closest = 30;
    positions.forEach((position, id) => { const [x, y] = worldToScreen(position.x, position.y, width, height); const distance = Math.hypot(point.x - x, point.y - y); if (distance < closest) { closest = distance; match = id; } });
    return match;
  }, [localPoint, positions, worldToScreen]);

  const handleWheel = useCallback((event: WheelEvent) => {
    event.preventDefault();
    if (event.deltaY > 0 && revealLimit < allNearbyCount && Date.now() - lastReveal.current > 350) { lastReveal.current = Date.now(); onRevealMore(); }
  }, [allNearbyCount, onRevealMore, revealLimit]);
  useEffect(() => { const canvas = canvasRef.current; if (!canvas) return; canvas.addEventListener('wheel', handleWheel, { passive: false }); return () => canvas.removeEventListener('wheel', handleWheel); }, [handleWheel]);
  const zoomCenter = (factor: number) => { const { width, height } = sizeRef.current; zoomAt(width / 2, height / 2, width, height, factor); };

  return <div className="relative h-full w-full">
    <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" style={{ cursor }} aria-label={root ? `Local concept network around ${root.name}` : 'Concept network waiting for a search'} onPointerDown={event => { cancelFlight(); event.currentTarget.setPointerCapture(event.pointerId); dragging.current = true; dragged.current = false; dragStart.current = { x: event.clientX, y: event.clientY }; }} onPointerMove={event => {
      if (!dragging.current) { setCursor(findConcept(event.clientX, event.clientY) ? 'pointer' : 'grab'); return; }
      const dx = event.clientX - dragStart.current.x; const dy = event.clientY - dragStart.current.y; if (Math.abs(dx) + Math.abs(dy) > 3) dragged.current = true; pan(dx, dy); dragStart.current = { x: event.clientX, y: event.clientY }; setCursor('grabbing');
    }} onPointerUp={event => {
      dragging.current = false; setCursor('grab'); if (dragged.current) return; const id = findConcept(event.clientX, event.clientY); const now = Date.now();
      if (!id) { onSelect(null); clickMemory.current = null; return; }
      if (clickMemory.current?.id === id && now - clickMemory.current.time < 420) { onOpen(id); clickMemory.current = null; }
      else { onSelect(id); clickMemory.current = { id, time: now }; }
    }} onPointerCancel={() => { dragging.current = false; setCursor('grab'); }} />
    {root && <div className="graph-context"><strong>{route ? 'Learning route' : root.name}</strong><span>{route ? `${route.conceptIds.length} concepts` : `${displayIds.length} of ${allNearbyCount} nearby concepts`}</span></div>}
    {root && !route && <div className="graph-legend"><span><i className="solid"/>prerequisite</span><span><i className="dashed"/>part of</span></div>}
    {root && !route && revealLimit < allNearbyCount && <button type="button" className="graph-reveal" onClick={onRevealMore}>Scroll or click to reveal more</button>}
    {root && <div className="graph-controls" aria-label="Graph controls"><button type="button" aria-label="Zoom in" onClick={() => zoomCenter(1.25)}>+</button><button type="button" aria-label="Zoom out" onClick={() => zoomCenter(.8)}>−</button><button type="button" aria-label="Reset graph view" onClick={reset}><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 11a8 8 0 1 1 2.2 5.5M4 11V5m0 6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></button></div>}
  </div>;
}

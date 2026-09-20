import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { concepts, conceptMap, clusterMap } from '../data/concepts';
import type { Concept } from '../data/concepts';
import { useCamera } from '../hooks/useCamera';
import type { KnowledgeRoute } from '../navigation/route-engine';

type RelationshipKind = 'prerequisite' | 'part_of' | 'related';
type Position = { x: number; y: number };
type VisibleEdge = { source: string; target: string; kind: RelationshipKind };
type LabelRect = { x: number; y: number; width: number; height: number };

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

function layoutRoute(ids: string[]) {
  const positions = new Map<string, Position>();
  let cursor = 0;
  ids.forEach((id, index) => {
    const concept = conceptMap.get(id);
    const previous = index ? conceptMap.get(ids[index - 1]) : null;
    if (index) {
      const currentWidth = Math.min(260, Math.max(150, (concept?.name.length ?? 12) * 8));
      const previousWidth = Math.min(260, Math.max(150, (previous?.name.length ?? 12) * 8));
      cursor += (currentWidth + previousWidth) / 2 + 110;
    }
    positions.set(id, { x: cursor, y: index % 2 ? 34 : -34 });
  });
  const center = cursor / 2;
  positions.forEach(position => { position.x -= center; });
  return positions;
}

function wrapLabel(name: string, maxCharacters = 23) {
  const words = name.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  words.forEach(word => {
    const next = line ? `${line} ${word}` : word;
    if (line && next.length > maxCharacters) { lines.push(line); line = word; }
    else line = next;
  });
  if (line) lines.push(line);
  return lines;
}

function intersects(left: LabelRect, right: LabelRect, gap = 7) {
  return left.x < right.x + right.width + gap && left.x + left.width + gap > right.x && left.y < right.y + right.height + gap && left.y + left.height + gap > right.y;
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
    if (route) return layoutRoute(route.conceptIds);
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
    });

    const occupied: LabelRect[] = [];
    const labelOrder = [...displayIds].sort((left, right) => {
      if (left === selectedId || left === rootId) return -1;
      if (right === selectedId || right === rootId) return 1;
      return 0;
    });
    labelOrder.forEach((id, index) => {
      const concept = conceptMap.get(id); const position = positions.get(id); if (!concept || !position) return;
      const isRoot = !route && id === rootId; const selected = id === selectedId;
      const [sx, sy] = worldToScreen(position.x, position.y, W, H);
      if (sx < -260 || sx > W + 260 || sy < 35 || sy > H + 100) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const fontSize = Math.max(isRoot ? 16 : 14, Math.min(isRoot ? 22 : 20, (isRoot ? 16 : 14) * zoom));
      const lineHeight = fontSize + 3;
      const lines = wrapLabel(concept.name, isRoot ? 26 : 22);
      const labelHeight = lines.length * lineHeight + 12;
      ctx.font = `${isRoot || selected ? 650 : 550} ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      const textWidth = Math.min(250, Math.max(72, ...lines.map(line => ctx.measureText(line).width)) + 22);
      const nodeRadius = isRoot ? 38 : 28;
      const candidates = [
        { x: sx - textWidth / 2, y: sy + nodeRadius },
        { x: sx - textWidth / 2, y: sy - nodeRadius - labelHeight },
        { x: sx + nodeRadius, y: sy - labelHeight / 2 },
        { x: sx - nodeRadius - textWidth, y: sy - labelHeight / 2 },
        { x: sx + 34, y: sy + 30 }, { x: sx - textWidth - 34, y: sy + 30 },
        { x: sx + 34, y: sy - labelHeight - 30 }, { x: sx - textWidth - 34, y: sy - labelHeight - 30 },
        ...Array.from({ length: 12 }, (_, candidateIndex) => {
          const angle = (candidateIndex / 12) * Math.PI * 2 + index * .37;
          const distance = 80 + Math.floor(candidateIndex / 4) * 34;
          return { x: sx + Math.cos(angle) * distance - textWidth / 2, y: sy + Math.sin(angle) * distance - labelHeight / 2 };
        }),
      ];
      const valid = candidates.filter(candidate => candidate.x >= 8 && candidate.x + textWidth <= W - 8 && candidate.y >= 72 && candidate.y + labelHeight <= H - 8);
      const chosen = valid.find(candidate => !occupied.some(rect => intersects({ ...candidate, width: textWidth, height: labelHeight }, rect))) ?? valid.sort((left, right) => {
        const overlapCount = (candidate: { x: number; y: number }) => occupied.filter(rect => intersects({ ...candidate, width: textWidth, height: labelHeight }, rect)).length;
        return overlapCount(left) - overlapCount(right);
      })[0];
      if (!chosen) return;
      const labelRect = { ...chosen, width: textWidth, height: labelHeight };
      occupied.push(labelRect);
      const labelCenterX = chosen.x + textWidth / 2; const labelCenterY = chosen.y + labelHeight / 2;
      if (Math.hypot(labelCenterX - sx, labelCenterY - sy) > 58) {
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(labelCenterX, labelCenterY); ctx.strokeStyle = selected ? '#7db9ad' : '#c7d3ce'; ctx.lineWidth = 1; ctx.stroke();
      }
      ctx.beginPath(); ctx.roundRect(chosen.x, chosen.y, textWidth, labelHeight, 7);
      ctx.fillStyle = isRoot ? '#163e35' : 'rgba(255,255,255,.97)'; ctx.fill();
      ctx.strokeStyle = selected ? '#1c8c78' : '#d7dfd9'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = isRoot ? '#fff' : '#172622'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      lines.forEach((line, lineIndex) => ctx.fillText(line, labelCenterX, chosen.y + 6 + lineHeight * (lineIndex + .5)));
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

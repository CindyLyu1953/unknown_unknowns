import { useRef, useEffect, useCallback, useState } from 'react';
import {
  concepts,
  conceptMap,
  CONTINENT_META,
  TERRAIN_CONTINENTS,
  WORLD,
} from '../data/concepts';
import type { Concept, ContinentId, TerrainContinent } from '../data/concepts';
import { useCamera } from '../hooks/useCamera';
import { conceptLabelFontSize } from '../map-visuals.mjs';
import type { KnowledgeRoute, RouteStepKind } from '../navigation/route-engine';

interface Props {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onOpen: (id: string) => void;
  focusId: string | null;
  onFocused: () => void;
  route: KnowledgeRoute | null;
}

type Point = [number, number];
type Bounds = { left: number; right: number; top: number; bottom: number };

const CENTER = { x: WORLD.w / 2, y: WORLD.h / 2 };
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function hash(value: string) {
  let result = 2166136261;
  for (const char of value) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
  return result >>> 0;
}

function titleCase(id: string) {
  return id.split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' ');
}

function pathRing(ctx: CanvasRenderingContext2D, ring: number[][]) {
  if (!ring.length) return;
  ctx.moveTo(ring[0][0], ring[0][1]);
  for (let index = 1; index < ring.length; index += 1) ctx.lineTo(ring[index][0], ring[index][1]);
  ctx.closePath();
}

function pathMultiPolygon(ctx: CanvasRenderingContext2D, polygons: number[][][][]) {
  ctx.beginPath();
  for (const polygon of polygons) for (const ring of polygon) pathRing(ctx, ring);
}

function irregularIsland(cx: number, cy: number, rx: number, ry: number): Point[] {
  return Array.from({ length: 18 }, (_, index) => {
    const angle = (index / 18) * Math.PI * 2;
    const wobble = 0.9 + ((hash(`citadel-${index}`) % 100) / 100) * 0.2;
    return [cx + Math.cos(angle) * rx * wobble, cy + Math.sin(angle) * ry * wobble];
  });
}

const CITADEL = irregularIsland(CENTER.x, CENTER.y + 30, 250, 185);

function pathPolygon(ctx: CanvasRenderingContext2D, points: Point[]) {
  ctx.beginPath();
  pathRing(ctx, points);
}

function visibleBounds(camera: { x: number; y: number; zoom: number }, W: number, H: number, pad = 100): Bounds {
  return {
    left: camera.x - W / camera.zoom / 2 - pad,
    right: camera.x + W / camera.zoom / 2 + pad,
    top: camera.y - H / camera.zoom / 2 - pad,
    bottom: camera.y + H / camera.zoom / 2 + pad,
  };
}

function inBounds(concept: Concept, bounds: Bounds) {
  return concept.x >= bounds.left && concept.x <= bounds.right && concept.y >= bounds.top && concept.y <= bounds.bottom;
}

function drawRoute(
  ctx: CanvasRenderingContext2D,
  from: Concept,
  to: Concept,
  highlighted: boolean,
  zoom: number,
) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const curve = Math.min(120, Math.hypot(dx, dy) * 0.1);
  ctx.save();
  ctx.strokeStyle = highlighted ? '#f4d67a' : 'rgba(210,184,128,0.22)';
  ctx.globalAlpha = highlighted ? 0.95 : Math.min(0.65, zoom * 0.7);
  ctx.lineWidth = highlighted ? 3 / zoom : 1.2 / zoom;
  ctx.setLineDash(highlighted ? [] : [7 / zoom, 8 / zoom]);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.bezierCurveTo(
    from.x + dx * 0.35 + dy / Math.max(1, Math.hypot(dx, dy)) * curve,
    from.y + dy * 0.35 - dx / Math.max(1, Math.hypot(dx, dy)) * curve,
    from.x + dx * 0.7 + dy / Math.max(1, Math.hypot(dx, dy)) * curve,
    from.y + dy * 0.7 - dx / Math.max(1, Math.hypot(dx, dy)) * curve,
    to.x,
    to.y,
  );
  ctx.stroke();
  ctx.restore();
}

function drawNavigationSegment(
  ctx: CanvasRenderingContext2D,
  from: Concept,
  to: Concept,
  kind: RouteStepKind,
  zoom: number,
) {
  const hierarchy = kind === 'zoom_out' || kind === 'enter_detail';
  const drawLine = (color: string, width: number) => {
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const bend = Math.min(150, Math.hypot(dx, dy) * 0.09);
    const length = Math.max(1, Math.hypot(dx, dy));
    ctx.bezierCurveTo(
      from.x + dx * 0.34 + dy / length * bend,
      from.y + dy * 0.34 - dx / length * bend,
      from.x + dx * 0.68 + dy / length * bend,
      from.y + dy * 0.68 - dx / length * bend,
      to.x,
      to.y,
    );
    ctx.strokeStyle = color;
    ctx.lineWidth = width / zoom;
    ctx.stroke();
  };
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash(hierarchy ? [12 / zoom, 6 / zoom] : []);
  drawLine('rgba(2,8,13,0.9)', 9);
  drawLine(kind === 'review_foundation' ? '#8fd6ad' : '#f4d67a', 5);
  ctx.restore();
}

function drawLandmark(
  ctx: CanvasRenderingContext2D,
  concept: Concept,
  selected: boolean,
  connected: boolean,
  zoom: number,
  routePosition: number | null,
  dimmed: boolean,
) {
  const meta = CONTINENT_META[concept.continent];
  const color = routePosition === 0 ? '#79cda5' : routePosition !== null ? '#f4d67a' : selected ? '#fff1a8' : connected ? '#f4d67a' : meta.label;
  const scale = 1 / zoom;
  ctx.save();
  ctx.globalAlpha = dimmed ? 0.22 : 1;
  ctx.translate(concept.x, concept.y);
  ctx.fillStyle = color;
  ctx.strokeStyle = selected ? '#fff8d1' : 'rgba(4,9,15,0.9)';
  ctx.lineWidth = 1.2 * scale;
  if (selected) {
    ctx.shadowColor = '#f4d67a';
    ctx.shadowBlur = 18 * scale;
  }

  if (concept.importance === 1) {
    const outer = (selected ? 9 : 7) * scale;
    ctx.beginPath();
    for (let index = 0; index < 10; index += 1) {
      const angle = -Math.PI / 2 + index * Math.PI / 5;
      const radius = index % 2 ? outer * 0.38 : outer;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      index ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (concept.importance === 2) {
    const radius = (selected ? 6 : 4.5) * scale;
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
    ctx.strokeRect(-radius, -radius, radius * 2, radius * 2);
  } else {
    const radius = (selected ? 5 : 3) * scale;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawRouteWaypoint(ctx: CanvasRenderingContext2D, concept: Concept, index: number, total: number, zoom: number) {
  const radius = 13 / zoom;
  ctx.save();
  ctx.translate(concept.x, concept.y);
  ctx.fillStyle = index === 0 ? '#79cda5' : index === total - 1 ? '#e6bd67' : '#e9dcae';
  ctx.strokeStyle = '#07111d';
  ctx.lineWidth = 3 / zoom;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#07111d';
  ctx.font = `700 ${12 / zoom}px "JetBrains Mono", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(index + 1), 0, 0.5 / zoom);
  ctx.restore();
}

function drawCompass(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = 'rgba(226,196,132,0.55)';
  ctx.fillStyle = 'rgba(226,196,132,0.75)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(0, 0, 28, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(-5, 7); ctx.lineTo(0, 3); ctx.lineTo(5, 7); ctx.closePath(); ctx.fill();
  ctx.font = '9px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('N', 0, -34);
  ctx.restore();
}

function drawMountain(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, zoom: number) {
  const scale = size / Math.max(0.55, Math.sqrt(zoom));
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(8, 14, 17, 0.5)';
  ctx.strokeStyle = 'rgba(224, 211, 174, 0.38)';
  ctx.lineWidth = 1.1 / zoom;
  ctx.beginPath();
  ctx.moveTo(0, -scale);
  ctx.lineTo(-scale * 0.78, scale * 0.64);
  ctx.lineTo(scale * 0.8, scale * 0.64);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-scale * 0.22, -scale * 0.56);
  ctx.lineTo(0, -scale);
  ctx.lineTo(scale * 0.25, -scale * 0.52);
  ctx.lineTo(scale * 0.08, -scale * 0.62);
  ctx.lineTo(-scale * 0.04, -scale * 0.45);
  ctx.closePath();
  ctx.fillStyle = 'rgba(244, 235, 207, 0.72)';
  ctx.fill();
  ctx.restore();
}

function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, zoom: number) {
  const scale = size / Math.max(0.6, Math.sqrt(zoom));
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(7, 24, 20, 0.72)';
  ctx.strokeStyle = 'rgba(132, 188, 145, 0.3)';
  ctx.lineWidth = 0.8 / zoom;
  ctx.beginPath();
  ctx.moveTo(0, -scale);
  ctx.lineTo(-scale * 0.65, scale * 0.5);
  ctx.lineTo(scale * 0.65, scale * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawTerrainDecorations(ctx: CanvasRenderingContext2D, continent: TerrainContinent, zoom: number) {
  if (zoom < 0.26 || zoom > 1.7) return;
  for (const region of continent.regions) {
    const seed = hash(region.id);
    const directionX = region.seed[0] - continent.cx;
    const directionY = region.seed[1] - continent.cy;
    const mountainX = region.seed[0] - directionX * 0.18 + ((seed % 130) - 65);
    const mountainY = region.seed[1] - directionY * 0.18 + (((seed >> 8) % 110) - 55);
    drawMountain(ctx, mountainX, mountainY, 20 + seed % 12, zoom);
    drawMountain(ctx, mountainX + 34, mountainY + 15, 13 + seed % 7, zoom);

    const forestX = region.seed[0] + directionX * 0.18 + (((seed >> 5) % 150) - 75);
    const forestY = region.seed[1] + directionY * 0.18 + (((seed >> 12) % 130) - 65);
    for (let index = 0; index < 5; index += 1) {
      const angle = ((seed % 360) + index * 137) * Math.PI / 180;
      const distance = 18 + (index % 3) * 18;
      drawTree(ctx, forestX + Math.cos(angle) * distance, forestY + Math.sin(angle) * distance, 9 + index % 3 * 2, zoom);
    }
  }
}

function drawContinent(ctx: CanvasRenderingContext2D, continent: TerrainContinent, zoom: number) {
  const meta = CONTINENT_META[continent.id];
  pathMultiPolygon(ctx, continent.coastline);
  ctx.strokeStyle = 'rgba(226,196,132,0.12)';
  ctx.lineWidth = 30 / Math.max(zoom, 0.18);
  ctx.stroke();
  pathMultiPolygon(ctx, continent.coastline);
  ctx.strokeStyle = 'rgba(232,205,149,0.2)';
  ctx.lineWidth = 14 / Math.max(zoom, 0.18);
  ctx.stroke();
  pathMultiPolygon(ctx, continent.coastline);
  ctx.fillStyle = meta.fill;
  ctx.fill('evenodd');

  ctx.save();
  pathMultiPolygon(ctx, continent.coastline);
  ctx.clip('evenodd');
  for (const [index, region] of continent.regions.entries()) {
    ctx.beginPath();
    pathRing(ctx, region.polygon);
    ctx.fillStyle = `hsla(${(hash(region.id) % 24) + ({ foundations: 135, computation: 196, modeling: 267, decisions: 33 }[continent.id])}, 38%, ${17 + index % 3 * 3}%, 0.72)`;
    ctx.fill();
    if (zoom > 0.25) {
      ctx.strokeStyle = 'rgba(231,215,172,0.12)';
      ctx.lineWidth = 2 / zoom;
      ctx.stroke();
    }
  }
  if (zoom > 0.22) {
    for (const [index, contour] of continent.elevation.entries()) {
      pathMultiPolygon(ctx, contour.coordinates);
      ctx.fillStyle = `rgba(245,232,193,${0.006 + index * 0.008})`;
      ctx.fill('evenodd');
      ctx.strokeStyle = `rgba(236,223,184,${0.035 + index * 0.018})`;
      ctx.lineWidth = 1.35 / zoom;
      ctx.stroke();
    }
  }
  const light = ctx.createLinearGradient(continent.cx - continent.rx, continent.cy - continent.ry, continent.cx + continent.rx, continent.cy + continent.ry);
  light.addColorStop(0, 'rgba(255,244,205,0.09)');
  light.addColorStop(0.48, 'rgba(255,244,205,0)');
  light.addColorStop(1, 'rgba(0,0,0,0.14)');
  ctx.fillStyle = light;
  ctx.fillRect(continent.cx - continent.rx * 1.2, continent.cy - continent.ry * 1.2, continent.rx * 2.4, continent.ry * 2.4);
  ctx.restore();

  drawTerrainDecorations(ctx, continent, zoom);

  pathMultiPolygon(ctx, continent.coastline);
  ctx.strokeStyle = 'rgba(226,196,132,0.48)';
  ctx.lineWidth = 2.5 / Math.max(zoom, 0.18);
  ctx.stroke();
}

export default function WorldMap({ selectedId, onSelect, onOpen, focusId, onFocused, route }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fogCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sizeRef = useRef({ width: 1, height: 1, dpr: 1 });
  const animationRef = useRef(0);
  const dragging = useRef(false);
  const dragged = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const clickMemory = useRef<{ id: string; time: number } | null>(null);
  const explored = useRef<Point[]>([[CENTER.x, CENTER.y]]);
  const discoveries = useRef<{ x: number; y: number; started: number }[]>([]);
  const [cursor, setCursor] = useState('grab');

  const { camera, worldToScreen, pan, zoomAt, flyTo, reset, cancelFlight } = useCamera({
    x: CENTER.x,
    y: CENTER.y,
    zoom: 0.16,
  });

  useEffect(() => {
    if (!focusId) return;
    const concept = conceptMap.get(focusId);
    if (!concept) return;
    if (!explored.current.some(point => Math.hypot(point[0] - concept.x, point[1] - concept.y) < 220)) {
      explored.current.push([concept.x, concept.y]);
      if (!REDUCED_MOTION) discoveries.current.push({ x: concept.x, y: concept.y, started: performance.now() });
    }
    flyTo(concept.x, concept.y, Math.max(camera.current.zoom, 1.15), onFocused);
  }, [camera, flyTo, focusId, onFocused]);

  const routeKey = route?.conceptIds.join('>') ?? '';
  useEffect(() => {
    if (!route || route.conceptIds.length < 2) return;
    const routeConcepts = route.conceptIds.map(id => conceptMap.get(id)).filter(Boolean) as Concept[];
    if (routeConcepts.length < 2) return;
    for (const concept of routeConcepts) {
      if (!explored.current.some(point => Math.hypot(point[0] - concept.x, point[1] - concept.y) < 220)) explored.current.push([concept.x, concept.y]);
    }
    const minX = Math.min(...routeConcepts.map(concept => concept.x));
    const maxX = Math.max(...routeConcepts.map(concept => concept.x));
    const minY = Math.min(...routeConcepts.map(concept => concept.y));
    const maxY = Math.max(...routeConcepts.map(concept => concept.y));
    const { width, height } = sizeRef.current;
    const targetZoom = Math.max(0.18, Math.min(1.45, Math.min((width - 500) / Math.max(520, maxX - minX), (height - 170) / Math.max(380, maxY - minY))));
    const centerX = (minX + maxX) / 2 - 195 / targetZoom;
    flyTo(centerX, (minY + maxY) / 2, targetZoom);
  }, [flyTo, routeKey]);

  const updateFog = useCallback((W: number, H: number, dpr: number) => {
    const canvas = fogCanvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, W, H);
    context.fillStyle = 'rgba(4,10,18,0.52)';
    context.fillRect(0, 0, W, H);
    context.globalCompositeOperation = 'destination-out';
    for (const point of explored.current) {
      const [x, y] = worldToScreen(point[0], point[1], W, H);
      const radius = Math.max(260, 650 * camera.current.zoom);
      const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, 'rgba(0,0,0,1)');
      gradient.addColorStop(0.62, 'rgba(0,0,0,0.82)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      context.fillStyle = gradient;
      context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    context.globalCompositeOperation = 'source-over';
  }, [camera, worldToScreen]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const { width: W, height: H, dpr } = sizeRef.current;
    const cam = camera.current;
    const activeRouteIds = route?.conceptIds ?? [];
    const activeRouteSet = new Set(activeRouteIds);
    const bounds = visibleBounds(cam, W, H, 160 / cam.zoom);
    const visibleConcepts = concepts.filter(concept => inBounds(concept, bounds));

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    const ocean = context.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H));
    ocean.addColorStop(0, '#10243a');
    ocean.addColorStop(0.55, '#091727');
    ocean.addColorStop(1, '#050b13');
    context.fillStyle = ocean;
    context.fillRect(0, 0, W, H);

    context.setTransform(dpr * cam.zoom, 0, 0, dpr * cam.zoom, dpr * (W / 2 - cam.x * cam.zoom), dpr * (H / 2 - cam.y * cam.zoom));
    context.strokeStyle = 'rgba(112,151,178,0.07)';
    context.lineWidth = 1 / cam.zoom;
    for (let x = 0; x <= WORLD.w; x += WORLD.tile) {
      context.beginPath(); context.moveTo(x, 0); context.lineTo(x, WORLD.h); context.stroke();
    }
    for (let y = 0; y <= WORLD.h; y += WORLD.tile) {
      context.beginPath(); context.moveTo(0, y); context.lineTo(WORLD.w, y); context.stroke();
    }

    for (const continent of TERRAIN_CONTINENTS) drawContinent(context, continent, cam.zoom);

    pathPolygon(context, CITADEL);
    context.fillStyle = CONTINENT_META.central.fill;
    context.fill();
    pathPolygon(context, CITADEL);
    context.strokeStyle = 'rgba(240,217,152,0.72)';
    context.lineWidth = 3 / cam.zoom;
    context.stroke();

    if (cam.zoom < 0.55) {
      const size = Math.max(48, 22 / cam.zoom);
      context.font = `600 ${size}px "Cinzel", serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      for (const continent of TERRAIN_CONTINENTS) {
        context.fillStyle = `${CONTINENT_META[continent.id].label}aa`;
        context.fillText(continent.name.toUpperCase(), continent.cx, continent.cy);
        context.font = `400 ${size * 0.42}px "Crimson Pro", serif`;
        context.fillStyle = 'rgba(239,225,190,0.5)';
        context.fillText(continent.subtitle, continent.cx, continent.cy + size * 0.72);
        context.font = `600 ${size}px "Cinzel", serif`;
      }
      context.font = `600 ${size * 0.42}px "Cinzel", serif`;
      context.fillStyle = CONTINENT_META.central.label;
      context.fillText('DATA SCIENCE CITADEL', CENTER.x, CENTER.y - 72);
    }

    if (cam.zoom >= 0.28 && cam.zoom < 0.82) {
      const size = Math.max(24, 11 / cam.zoom);
      context.font = `500 ${size}px "Cinzel", serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      for (const continent of TERRAIN_CONTINENTS) {
        context.fillStyle = `${CONTINENT_META[continent.id].label}99`;
        for (const region of continent.regions) context.fillText(titleCase(region.id), region.seed[0], region.seed[1]);
      }
    }

    if (cam.zoom > 0.38) {
      for (const concept of visibleConcepts) {
        for (const prerequisiteId of concept.prerequisites) {
          const prerequisite = conceptMap.get(prerequisiteId);
          if (!prerequisite) continue;
          const highlighted = !route && (selectedId === concept.id || selectedId === prerequisite.id);
          if (!highlighted && cam.zoom < 0.72) continue;
          if (!highlighted && !inBounds(prerequisite, bounds)) continue;
          drawRoute(context, prerequisite, concept, highlighted, cam.zoom);
        }
      }
    }

    if (route) {
      for (const [index, step] of route.steps.entries()) {
        const from = conceptMap.get(step.fromId);
        const to = conceptMap.get(step.toId);
        if (from && to) drawNavigationSegment(context, from, to, step.kind, cam.zoom);
      }
    }

    const selected = selectedId ? conceptMap.get(selectedId) : null;
    const visibleByZoom = visibleConcepts.filter(concept =>
      activeRouteSet.has(concept.id) || concept.importance === 1 ||
      (concept.importance === 2 && cam.zoom > 0.34) ||
      (concept.importance === 3 && cam.zoom > 0.68)
    );
    for (const concept of visibleByZoom) {
      const connected = Boolean(selected && (
        concept.prerequisites.includes(selected.id) || selected.prerequisites.includes(concept.id) ||
        concept.parents.includes(selected.id) || selected.parents.includes(concept.id) ||
        concept.children.includes(selected.id) || selected.children.includes(concept.id)
      ));
      const routePosition = route ? activeRouteIds.indexOf(concept.id) : -1;
      drawLandmark(context, concept, concept.id === selectedId, connected, cam.zoom, routePosition >= 0 ? routePosition : null, Boolean(route && routePosition < 0));
    }

    if (route) {
      activeRouteIds.forEach((id, index) => {
        const concept = conceptMap.get(id);
        if (concept) drawRouteWaypoint(context, concept, index, activeRouteIds.length, cam.zoom);
      });
    }

    if (!REDUCED_MOTION) {
      const now = performance.now();
      discoveries.current = discoveries.current.filter(item => now - item.started < 1100);
      for (const item of discoveries.current) {
        const progress = (now - item.started) / 1100;
        context.beginPath();
        context.arc(item.x, item.y, progress * 120, 0, Math.PI * 2);
        context.strokeStyle = `rgba(244,214,122,${(1 - progress) * 0.7})`;
        context.lineWidth = 2 / cam.zoom;
        context.stroke();
      }
    }

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    const occupied: { x: number; y: number; width: number; height: number }[] = [];
    const sorted = [...visibleByZoom].sort((a, b) => a.importance - b.importance);
    for (const concept of sorted) {
      const isSelected = concept.id === selectedId;
      const onRoute = activeRouteSet.has(concept.id);
      if (route && !onRoute && !isSelected) continue;
      const showLabel = onRoute || isSelected || (cam.zoom >= 0.24 && concept.importance === 1) || cam.zoom > (concept.importance === 2 ? 0.48 : 0.9);
      if (!showLabel) continue;
      const [x, y] = worldToScreen(concept.x, concept.y, W, H);
      const fontSize = conceptLabelFontSize(cam.zoom, concept.importance, isSelected || onRoute);
      context.font = `${concept.importance === 1 || isSelected || onRoute ? 600 : 500} ${fontSize}px "Crimson Pro", serif`;
      const width = context.measureText(concept.name).width;
      const paddingX = cam.zoom >= 0.82 || isSelected ? 6 : 2;
      const paddingY = cam.zoom >= 0.82 || isSelected ? 3 : 1;
      const box = { x: x + 11, y: y - fontSize / 2 - paddingY, width: width + paddingX * 2, height: fontSize + paddingY * 2 + 2 };
      const behindChrome =
        (box.x < 235 && box.y > H - 225) ||
        (box.x > W - 135 && box.y > H - 205) ||
        (box.y < 78 && box.x < 520) ||
        (box.y < 68 && box.x > W - 330);
      if (behindChrome && !isSelected) continue;
      const collision = occupied.some(other => box.x < other.x + other.width + 8 && box.x + box.width + 8 > other.x && box.y < other.y + other.height + 5 && box.y + box.height + 5 > other.y);
      if (collision && !isSelected && !onRoute) continue;
      if (cam.zoom >= 0.82 || isSelected) {
        context.beginPath();
        context.roundRect(box.x, box.y, box.width, box.height, 4);
        context.fillStyle = isSelected ? 'rgba(48,38,18,0.92)' : 'rgba(3,9,15,0.76)';
        context.fill();
        context.strokeStyle = isSelected ? 'rgba(255,231,151,0.9)' : `${CONTINENT_META[concept.continent].label}66`;
        context.lineWidth = isSelected ? 1.5 : 0.8;
        context.stroke();
      }
      context.fillStyle = isSelected || onRoute ? '#fff3bd' : '#f2e8cf';
      context.textBaseline = 'top';
      context.shadowColor = 'rgba(0,0,0,1)';
      context.shadowBlur = 7;
      context.fillText(concept.name, box.x + paddingX, box.y + paddingY);
      context.shadowBlur = 0;
      occupied.push(box);
    }

    if (cam.zoom > 0.3) {
      updateFog(W, H, dpr);
      const fog = fogCanvasRef.current;
      if (fog) context.drawImage(fog, 0, 0, fog.width, fog.height, 0, 0, W, H);
    }

    const vignette = context.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, Math.max(W, H) * 0.72);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(1,4,9,0.72)');
    context.fillStyle = vignette;
    context.fillRect(0, 0, W, H);
    drawCompass(context, W - 55, H - 58);
    context.font = '10px "JetBrains Mono", monospace';
    context.fillStyle = 'rgba(226,196,132,0.48)';
    context.textAlign = 'left';
    context.fillText(`ZOOM ×${cam.zoom.toFixed(2)} · ${visibleByZoom.length} PLACES RENDERED`, 20, H - 20);

    animationRef.current = requestAnimationFrame(render);
  }, [camera, route, selectedId, updateFog, worldToScreen]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    fogCanvasRef.current = document.createElement('canvas');
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      sizeRef.current = { width: rect.width, height: rect.height, dpr };
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    animationRef.current = requestAnimationFrame(render);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(animationRef.current);
    };
  }, [render]);

  const pointerPosition = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
  }, []);

  const findConceptAt = useCallback((clientX: number, clientY: number) => {
    const { width, height } = sizeRef.current;
    const point = pointerPosition(clientX, clientY);
    const cam = camera.current;
    let result: Concept | null = null;
    let closest = 18;
    for (const concept of concepts) {
      if (concept.importance === 2 && cam.zoom < 0.34) continue;
      if (concept.importance === 3 && cam.zoom < 0.68) continue;
      const [x, y] = worldToScreen(concept.x, concept.y, width, height);
      const distance = Math.hypot(point.x - x, point.y - y);
      if (distance < closest) {
        closest = distance;
        result = concept;
      }
    }
    return result;
  }, [camera, pointerPosition, worldToScreen]);

  const handlePointerDown = useCallback((event: React.PointerEvent) => {
    cancelFlight();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragging.current = true;
    dragged.current = false;
    dragStart.current = { x: event.clientX, y: event.clientY };
  }, [cancelFlight]);

  const handlePointerMove = useCallback((event: React.PointerEvent) => {
    if (!dragging.current) {
      setCursor(findConceptAt(event.clientX, event.clientY) ? 'pointer' : 'grab');
      return;
    }
    const dx = event.clientX - dragStart.current.x;
    const dy = event.clientY - dragStart.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) dragged.current = true;
    pan(dx, dy);
    dragStart.current = { x: event.clientX, y: event.clientY };
    setCursor('grabbing');
    const cam = camera.current;
    const last = explored.current.at(-1);
    if (!last || Math.hypot(last[0] - cam.x, last[1] - cam.y) > 240) {
      explored.current.push([cam.x, cam.y]);
      if (!REDUCED_MOTION) discoveries.current.push({ x: cam.x, y: cam.y, started: performance.now() });
    }
  }, [camera, findConceptAt, pan]);

  const handlePointerUp = useCallback((event: React.PointerEvent) => {
    dragging.current = false;
    setCursor('grab');
    if (dragged.current) return;
    const concept = findConceptAt(event.clientX, event.clientY);
    const now = Date.now();
    if (!concept) {
      onSelect(null);
      clickMemory.current = null;
      return;
    }
    const previous = clickMemory.current;
    if (previous?.id === concept.id && now - previous.time < 420) {
      onOpen(concept.id);
      flyTo(concept.x, concept.y, Math.max(camera.current.zoom, 1.25));
      clickMemory.current = null;
    } else {
      onSelect(concept.id);
      clickMemory.current = { id: concept.id, time: now };
    }
  }, [camera, findConceptAt, flyTo, onOpen, onSelect]);

  const handleWheel = useCallback((event: WheelEvent) => {
    event.preventDefault();
    cancelFlight();
    const point = pointerPosition(event.clientX, event.clientY);
    const { width, height } = sizeRef.current;
    zoomAt(point.x, point.y, width, height, event.deltaY < 0 ? 1.13 : 0.885);
  }, [cancelFlight, pointerPosition, zoomAt]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const zoomFromCenter = (factor: number) => {
    const { width, height } = sizeRef.current;
    cancelFlight();
    zoomAt(width / 2, height / 2, width, height, factor);
  };

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full touch-none"
        style={{ cursor, background: '#050b13' }}
        aria-label="Interactive map of 440 data science concepts. Drag to explore, scroll to zoom, click to select, and double-click a place to study it."
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => { dragging.current = false; setCursor('grab'); }}
      />
      <div className="absolute bottom-8 right-16 flex flex-col gap-1 z-20" aria-label="Map controls">
        <button type="button" aria-label="Zoom in" onClick={() => zoomFromCenter(1.3)} className="map-control">+</button>
        <button type="button" aria-label="Zoom out" onClick={() => zoomFromCenter(0.77)} className="map-control">−</button>
        <button type="button" aria-label="Reset map view" onClick={reset} className="map-control text-xs">⌂</button>
      </div>
    </div>
  );
}

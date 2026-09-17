import { concepts, conceptMap } from '../data/concepts';
import type { Concept } from '../data/concepts';

export type RouteStepKind = 'learn_next' | 'review_foundation' | 'zoom_out' | 'enter_detail';

export interface RouteStep {
  fromId: string;
  toId: string;
  kind: RouteStepKind;
  instruction: string;
  cost: number;
}

export interface KnowledgeRoute {
  startId: string;
  endId: string;
  conceptIds: string[];
  steps: RouteStep[];
  totalCost: number;
}

type Edge = { toId: string; kind: RouteStepKind; cost: number };

const STEP_COPY: Record<RouteStepKind, (from: Concept, to: Concept) => string> = {
  learn_next: (from, to) => `Continue from ${from.name} to ${to.name}`,
  review_foundation: (from, to) => `Review the foundation: ${to.name}`,
  zoom_out: (from, to) => `Zoom out to the broader territory: ${to.name}`,
  enter_detail: (from, to) => `Enter the more specific place: ${to.name}`,
};

function buildGraph(items: Concept[]) {
  const graph = new Map(items.map(item => [item.id, new Map<string, Edge>()]));
  const add = (fromId: string, edge: Edge) => {
    const neighbors = graph.get(fromId);
    if (!neighbors || !graph.has(edge.toId)) return;
    const current = neighbors.get(edge.toId);
    if (!current || edge.cost < current.cost) neighbors.set(edge.toId, edge);
  };

  for (const concept of items) {
    for (const prerequisiteId of concept.prerequisites) {
      add(prerequisiteId, { toId: concept.id, kind: 'learn_next', cost: 1 });
      add(concept.id, { toId: prerequisiteId, kind: 'review_foundation', cost: 2.2 });
    }
    for (const parentId of concept.parents) {
      add(concept.id, { toId: parentId, kind: 'zoom_out', cost: 0.65 });
      add(parentId, { toId: concept.id, kind: 'enter_detail', cost: 0.8 });
    }
  }
  return graph;
}

const graph = buildGraph(concepts);

export function findKnowledgeRoute(startId: string | null, endId: string | null): KnowledgeRoute | null {
  if (!startId || !endId || !graph.has(startId) || !graph.has(endId)) return null;
  if (startId === endId) return { startId, endId, conceptIds: [startId], steps: [], totalCost: 0 };

  const distances = new Map<string, number>([[startId, 0]]);
  const previous = new Map<string, { fromId: string; edge: Edge }>();
  const open = new Set<string>([startId]);

  while (open.size) {
    let currentId: string | null = null;
    let currentDistance = Infinity;
    for (const id of open) {
      const distance = distances.get(id) ?? Infinity;
      if (distance < currentDistance) {
        currentDistance = distance;
        currentId = id;
      }
    }
    if (!currentId) break;
    open.delete(currentId);
    if (currentId === endId) break;

    for (const edge of graph.get(currentId)?.values() ?? []) {
      const candidateDistance = currentDistance + edge.cost + 0.02;
      if (candidateDistance >= (distances.get(edge.toId) ?? Infinity)) continue;
      distances.set(edge.toId, candidateDistance);
      previous.set(edge.toId, { fromId: currentId, edge });
      open.add(edge.toId);
    }
  }

  if (!previous.has(endId)) return null;
  const conceptIds = [endId];
  const reversedSteps: Array<Omit<RouteStep, 'instruction'>> = [];
  let cursor = endId;
  while (cursor !== startId) {
    const item = previous.get(cursor);
    if (!item) return null;
    reversedSteps.push({ fromId: item.fromId, toId: cursor, kind: item.edge.kind, cost: item.edge.cost });
    cursor = item.fromId;
    conceptIds.push(cursor);
  }
  conceptIds.reverse();
  const steps = reversedSteps.reverse().map(step => {
    const from = conceptMap.get(step.fromId);
    const to = conceptMap.get(step.toId);
    return {
      ...step,
      instruction: from && to ? STEP_COPY[step.kind](from, to) : `${step.fromId} → ${step.toId}`,
    };
  });

  return {
    startId,
    endId,
    conceptIds,
    steps,
    totalCost: distances.get(endId) ?? 0,
  };
}

export const routeStepLabels: Record<RouteStepKind, string> = {
  learn_next: 'Learn next',
  review_foundation: 'Review foundation',
  zoom_out: 'Broader territory',
  enter_detail: 'Enter subfield',
};

import { concepts, conceptMap, getConceptSummary } from '../data/concepts';
import type { Concept } from '../data/concepts';

export type RouteStepKind = 'learn_next' | 'review_foundation' | 'zoom_out' | 'enter_detail' | 'concept_bridge';

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
  concept_bridge: (from, to) => `Connect ${from.name} to the related concept ${to.name}`,
};

const STOP_WORDS = new Set(['about', 'after', 'also', 'among', 'another', 'because', 'been', 'before', 'being', 'between', 'both', 'can', 'collection', 'concept', 'data', 'different', 'does', 'each', 'from', 'have', 'into', 'more', 'other', 'over', 'rather', 'such', 'than', 'that', 'their', 'them', 'these', 'they', 'this', 'through', 'under', 'using', 'when', 'where', 'which', 'while', 'with', 'within']);

function normalizeToken(token: string) {
  const aliases: Record<string, string> = {
    bayesian: 'bayes', bayes: 'bayes', probabilities: 'probability', statistical: 'statistic', statistics: 'statistic',
    distributions: 'distribution', processes: 'process', variables: 'variable', models: 'model', modeling: 'model',
  };
  if (aliases[token]) return aliases[token];
  if (token.length > 5 && token.endsWith('ing')) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith('ed')) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith('s')) return token.slice(0, -1);
  return token;
}

function tokenize(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/).map(normalizeToken).filter(token => token.length > 2 && !STOP_WORDS.has(token));
}

const depthCache = new Map<string, number>();
function taxonomyDepth(id: string, visiting = new Set<string>()): number {
  const cached = depthCache.get(id);
  if (cached !== undefined) return cached;
  const concept = conceptMap.get(id);
  if (!concept || visiting.has(id)) return 2;
  if (concept.parents.includes('data-science')) {
    depthCache.set(id, 1);
    return 1;
  }
  const nextVisiting = new Set(visiting).add(id);
  const parentDepths = concept.parents.filter(parentId => conceptMap.has(parentId)).map(parentId => taxonomyDepth(parentId, nextVisiting));
  const depth = parentDepths.length ? Math.min(...parentDepths) + 1 : 2;
  depthCache.set(id, depth);
  return depth;
}

function topLevelScopes(id: string) {
  const scopes = new Set<string>();
  const visited = new Set<string>();
  const visit = (currentId: string) => {
    if (visited.has(currentId)) return;
    visited.add(currentId);
    const concept = conceptMap.get(currentId);
    if (!concept) return;
    if (taxonomyDepth(currentId) === 1) scopes.add(currentId);
    concept.parents.filter(parentId => parentId !== 'data-science').forEach(visit);
  };
  visit(id);
  return scopes;
}

function sharesScope(left: Set<string>, right: Set<string>) {
  for (const value of left) if (right.has(value)) return true;
  return false;
}

function semanticVectors(items: Concept[]) {
  const documents = items.map(item => tokenize(`${item.name} ${item.name} ${getConceptSummary(item)}`));
  const documentFrequency = new Map<string, number>();
  documents.forEach(tokens => new Set(tokens).forEach(token => documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1)));
  return new Map(items.map((item, index) => {
    const counts = new Map<string, number>();
    documents[index].forEach(token => counts.set(token, (counts.get(token) ?? 0) + 1));
    const vector = new Map<string, number>();
    let magnitude = 0;
    counts.forEach((count, token) => {
      const weight = (1 + Math.log(count)) * Math.log((items.length + 1) / ((documentFrequency.get(token) ?? 0) + 1));
      vector.set(token, weight); magnitude += weight * weight;
    });
    const normalizer = Math.sqrt(magnitude) || 1;
    vector.forEach((weight, token) => vector.set(token, weight / normalizer));
    return [item.id, vector];
  }));
}

function cosine(left: Map<string, number>, right: Map<string, number>) {
  const [small, large] = left.size <= right.size ? [left, right] : [right, left];
  let score = 0;
  small.forEach((weight, token) => { score += weight * (large.get(token) ?? 0); });
  return score;
}

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

  const navigable = items.filter(item => taxonomyDepth(item.id) >= 2);
  const vectors = semanticVectors(navigable);
  const scopes = new Map(navigable.map(item => [item.id, topLevelScopes(item.id)]));
  const candidates = new Map(navigable.map(item => [item.id, [] as Array<{ id: string; similarity: number }>]));
  for (let leftIndex = 0; leftIndex < navigable.length; leftIndex += 1) {
    const left = navigable[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < navigable.length; rightIndex += 1) {
      const right = navigable[rightIndex];
      const similarity = cosine(vectors.get(left.id)!, vectors.get(right.id)!);
      const sameScope = sharesScope(scopes.get(left.id)!, scopes.get(right.id)!);
      if (similarity < (sameScope ? 0.055 : 0.24)) continue;
      candidates.get(left.id)!.push({ id: right.id, similarity });
      candidates.get(right.id)!.push({ id: left.id, similarity });
    }
  }
  candidates.forEach((peers, fromId) => {
    peers.sort((left, right) => right.similarity - left.similarity || left.id.localeCompare(right.id)).slice(0, 6).forEach(peer => {
      const cost = 1.35 + (1 - Math.min(peer.similarity, 0.8)) * 1.15;
      add(fromId, { toId: peer.id, kind: 'concept_bridge', cost });
      add(peer.id, { toId: fromId, kind: 'concept_bridge', cost });
    });
  });
  return graph;
}

const graph = buildGraph(concepts);

export function findKnowledgeRoute(startId: string | null, endId: string | null): KnowledgeRoute | null {
  if (!startId || !endId || !graph.has(startId) || !graph.has(endId)) return null;
  if (startId === endId) return { startId, endId, conceptIds: [startId], steps: [], totalCost: 0 };

  const search = (allowBroadIntermediates: boolean) => {
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
        const broadIntermediate = edge.toId !== endId && taxonomyDepth(edge.toId) <= 1;
        if (broadIntermediate && !allowBroadIntermediates) continue;
        const breadthPenalty = broadIntermediate ? 6 : 0;
        const candidateDistance = currentDistance + edge.cost + breadthPenalty + 0.02;
        if (candidateDistance >= (distances.get(edge.toId) ?? Infinity)) continue;
        distances.set(edge.toId, candidateDistance);
        previous.set(edge.toId, { fromId: currentId, edge });
        open.add(edge.toId);
      }
    }
    return { distances, previous };
  };

  let { distances, previous } = search(false);
  if (!previous.has(endId)) ({ distances, previous } = search(true));
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
  concept_bridge: 'Related concept',
};

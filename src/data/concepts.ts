import universeData from './concept-universe.json';
import pairData from './concept-pairs.json';

export type ConceptImportance = 1 | 2 | 3;
export type ClusterId =
  | 'mathematical-foundations'
  | 'probability'
  | 'statistics'
  | 'data-collection-and-preparation'
  | 'data-management'
  | 'data-engineering-and-systems'
  | 'data-analysis'
  | 'data-mining-and-unstructured-data'
  | 'machine-learning'
  | 'experimentation-and-causal-reasoning'
  | 'research-and-decision-practice'
  | 'responsible-data-science';

export interface ConceptCluster {
  id: ClusterId;
  name: string;
  description: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  surface: string;
}

export interface Concept {
  id: string;
  name: string;
  clusterId: ClusterId;
  region: string;
  importance: ConceptImportance;
  prerequisites: string[];
  parents: string[];
  children: string[];
  unlocks: string[];
  status: string;
  sourceRefs: string[];
  x: number;
  y: number;
}

export const WORLD = { w: 3220, h: 2640 };

const CLUSTER_SIZE = { width: 700, height: 700 };
export const CONCEPT_CLUSTERS: ConceptCluster[] = [
  { id: 'mathematical-foundations', name: 'Mathematical Foundations', description: 'Structures, algebra, calculus, and optimization', x: 420, y: 460, ...CLUSTER_SIZE, color: '#8250df', surface: '#f6f0ff' },
  { id: 'probability', name: 'Probability', description: 'Randomness, distributions, and uncertainty', x: 1210, y: 460, ...CLUSTER_SIZE, color: '#57606a', surface: '#f3f4f6' },
  { id: 'statistics', name: 'Statistics', description: 'Inference, estimation, and evidence', x: 2000, y: 460, ...CLUSTER_SIZE, color: '#1a7f37', surface: '#effaf2' },
  { id: 'experimentation-and-causal-reasoning', name: 'Experimentation & Causal Reasoning', description: 'Interventions, counterfactuals, and effects', x: 2790, y: 460, ...CLUSTER_SIZE, color: '#bf8700', surface: '#fff8e6' },
  { id: 'data-collection-and-preparation', name: 'Data Collection & Preparation', description: 'Sampling, cleaning, and feature preparation', x: 420, y: 1320, ...CLUSTER_SIZE, color: '#0969da', surface: '#eef6ff' },
  { id: 'data-management', name: 'Data Management', description: 'Models, databases, governance, and access', x: 1210, y: 1320, ...CLUSTER_SIZE, color: '#0969da', surface: '#eef6ff' },
  { id: 'data-engineering-and-systems', name: 'Data Engineering & Systems', description: 'Programming, pipelines, and computing systems', x: 2000, y: 1320, ...CLUSTER_SIZE, color: '#0969da', surface: '#eef6ff' },
  { id: 'responsible-data-science', name: 'Responsible Data Science', description: 'Privacy, fairness, safety, and accountability', x: 2790, y: 1320, ...CLUSTER_SIZE, color: '#cf222e', surface: '#fff1f1' },
  { id: 'data-analysis', name: 'Data Analysis', description: 'Exploration, patterns, and interpretation', x: 420, y: 2180, ...CLUSTER_SIZE, color: '#1a7f37', surface: '#effaf2' },
  { id: 'data-mining-and-unstructured-data', name: 'Data Mining & Unstructured Data', description: 'Text, graphs, patterns, and retrieval', x: 1210, y: 2180, ...CLUSTER_SIZE, color: '#8250df', surface: '#f6f0ff' },
  { id: 'machine-learning', name: 'Machine Learning', description: 'Prediction, representation, and generalization', x: 2000, y: 2180, ...CLUSTER_SIZE, color: '#8250df', surface: '#f6f0ff' },
  { id: 'research-and-decision-practice', name: 'Research & Decision Practice', description: 'Communication, decisions, and real-world impact', x: 2790, y: 2180, ...CLUSTER_SIZE, color: '#bf8700', surface: '#fff8e6' },
];

export const clusterMap = new Map(CONCEPT_CLUSTERS.map(cluster => [cluster.id, cluster]));

const AREA_ALIASES: Record<string, ClusterId> = {
  mathematics: 'mathematical-foundations',
  computing: 'data-engineering-and-systems',
  systems: 'data-engineering-and-systems',
  analysis: 'data-analysis',
  ml: 'machine-learning',
  causal: 'experimentation-and-causal-reasoning',
  root: 'research-and-decision-practice',
};

const prerequisites = new Map<string, string[]>();
const unlocks = new Map<string, string[]>();
const parents = new Map<string, string[]>();
const children = new Map<string, string[]>();

function append(map: Map<string, string[]>, key: string, value: string) {
  const values = map.get(key) ?? [];
  if (!values.includes(value)) values.push(value);
  map.set(key, values);
}

for (const pair of pairData.records) {
  if (pair.label === 'prerequisite_of') {
    append(prerequisites, pair.concept_b_id, pair.concept_a_id);
    append(unlocks, pair.concept_a_id, pair.concept_b_id);
  } else if (pair.label === 'part_of') {
    append(parents, pair.concept_a_id, pair.concept_b_id);
    append(children, pair.concept_b_id, pair.concept_a_id);
  }
}

function titleCase(id: string) {
  return id.split('-').map(word => word.length <= 3 && word !== 'and' ? word.toUpperCase() : word[0].toUpperCase() + word.slice(1)).join(' ');
}

function normalizeArea(area: string): ClusterId {
  return AREA_ALIASES[area] ?? area as ClusterId;
}

function clusterFor(raw: RawConcept): ClusterId {
  const matchingCluster = CONCEPT_CLUSTERS.find(cluster => cluster.id === raw.id);
  return matchingCluster?.id ?? normalizeArea(raw.area);
}

function importanceFor(id: string, status: string): ConceptImportance {
  const childCount = children.get(id)?.length ?? 0;
  if (id === 'data-science' || CONCEPT_CLUSTERS.some(cluster => cluster.id === id) || childCount >= 5) return 1;
  if (childCount > 0 || status === 'validated_seed') return 2;
  return 3;
}

type RawConcept = (typeof universeData.concepts)[number];
const grouped = new Map<ClusterId, RawConcept[]>();
for (const raw of universeData.concepts) {
  if (raw.id === 'data-science') continue;
  const clusterId = clusterFor(raw);
  const values = grouped.get(clusterId) ?? [];
  values.push(raw);
  grouped.set(clusterId, values);
}

const positioned = new Map<string, { clusterId: ClusterId; x: number; y: number; importance: ConceptImportance }>();
positioned.set('data-science', {
  clusterId: 'research-and-decision-practice',
  importance: 1,
  x: WORLD.w / 2,
  y: 890,
});
for (const cluster of CONCEPT_CLUSTERS) {
  const items = [...(grouped.get(cluster.id) ?? [])].sort((a, b) => {
    const importanceDifference = importanceFor(a.id, a.status) - importanceFor(b.id, b.status);
    return importanceDifference || a.name.localeCompare(b.name);
  });
  const columns = 4;
  items.forEach((item, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    positioned.set(item.id, {
      clusterId: cluster.id,
      importance: importanceFor(item.id, item.status),
      x: cluster.x - 248 + column * 165 + (row % 2 ? 18 : 0),
      y: cluster.y - 208 + row * 62,
    });
  });
}

const fallbackCluster = CONCEPT_CLUSTERS[CONCEPT_CLUSTERS.length - 1];
export const concepts: Concept[] = universeData.concepts.map(raw => {
  const position = positioned.get(raw.id) ?? { clusterId: fallbackCluster.id, x: fallbackCluster.x, y: fallbackCluster.y, importance: importanceFor(raw.id, raw.status) };
  return {
    id: raw.id,
    name: raw.name,
    clusterId: position.clusterId,
    region: raw.id === 'data-science' ? 'Universe' : titleCase(position.clusterId),
    importance: position.importance,
    prerequisites: prerequisites.get(raw.id) ?? [],
    parents: parents.get(raw.id) ?? [],
    children: children.get(raw.id) ?? [],
    unlocks: unlocks.get(raw.id) ?? [],
    status: raw.status,
    sourceRefs: raw.source_refs,
    x: position.x,
    y: position.y,
  };
});

export const conceptMap = new Map(concepts.map(concept => [concept.id, concept]));
const nameById = new Map(concepts.map(concept => [concept.id, concept.name]));

function names(ids: string[], fallback: string) {
  const values = ids.map(id => nameById.get(id)).filter(Boolean).slice(0, 3);
  return values.length ? values.join(', ') : fallback;
}

export function getConceptDescription(concept: Concept) {
  const parentNames = names(concept.parents, concept.region);
  const prerequisiteNames = names(concept.prerequisites, 'your existing intuition and curiosity');
  const childNames = names(concept.children, 'more precise questions inside this field');
  const unlockNames = names(concept.unlocks, childNames);
  return {
    question: `${concept.name} asks what becomes visible once we look at data through the lens of ${parentNames}. It is less a definition than a particular way of questioning evidence, patterns, and uncertainty.`,
    fascination: `People are drawn to ${concept.name} because it turns an abstract problem into something that can be inspected, challenged, or built. The interesting part is often the shift in what you notice, not merely the technique itself.`,
    world: `Following this path opens routes toward ${unlockNames}. These neighboring ideas show how one concept can change the questions you are able to ask elsewhere.`,
    entrance: `The gentlest entrance is through ${prerequisiteNames}. Start with one concrete example, then return to the formal language after the central intuition feels familiar.`,
    relevance: `You may care about ${concept.name} if you enjoy finding hidden structure, testing explanations, or understanding how decisions emerge from imperfect information.`,
  };
}

export const relationCount = pairData.records.length;

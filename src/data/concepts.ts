import universeData from './concept-universe.json';
import pairData from './concept-pairs.json';
import descriptionData from './concept-descriptions.json';

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
  color: string;
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
}

export const CONCEPT_CLUSTERS: ConceptCluster[] = [
  { id: 'mathematical-foundations', name: 'Mathematical Foundations', color: '#8250df' },
  { id: 'probability', name: 'Probability', color: '#57606a' },
  { id: 'statistics', name: 'Statistics', color: '#1a7f37' },
  { id: 'experimentation-and-causal-reasoning', name: 'Experimentation & Causal Reasoning', color: '#bf8700' },
  { id: 'data-collection-and-preparation', name: 'Data Collection & Preparation', color: '#0969da' },
  { id: 'data-management', name: 'Data Management', color: '#0969da' },
  { id: 'data-engineering-and-systems', name: 'Data Engineering & Systems', color: '#0969da' },
  { id: 'responsible-data-science', name: 'Responsible Data Science', color: '#cf222e' },
  { id: 'data-analysis', name: 'Data Analysis', color: '#1a7f37' },
  { id: 'data-mining-and-unstructured-data', name: 'Data Mining & Unstructured Data', color: '#8250df' },
  { id: 'machine-learning', name: 'Machine Learning', color: '#8250df' },
  { id: 'research-and-decision-practice', name: 'Research & Decision Practice', color: '#bf8700' },
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
const fallbackCluster = CONCEPT_CLUSTERS[CONCEPT_CLUSTERS.length - 1];
export const concepts: Concept[] = universeData.concepts.filter(raw => raw.id !== 'data-science').map(raw => {
  const clusterId = clusterFor(raw) ?? fallbackCluster.id;
  return {
    id: raw.id,
    name: raw.name,
    clusterId,
    region: titleCase(clusterId),
    importance: importanceFor(raw.id, raw.status),
    prerequisites: prerequisites.get(raw.id) ?? [],
    parents: parents.get(raw.id) ?? [],
    children: children.get(raw.id) ?? [],
    unlocks: unlocks.get(raw.id) ?? [],
    status: raw.status,
    sourceRefs: raw.source_refs,
  };
});

export const conceptMap = new Map(concepts.map(concept => [concept.id, concept]));
const nameById = new Map(concepts.map(concept => [concept.id, concept.name]));
const generatedDescriptions = descriptionData.descriptions as Record<string, { summary?: string }>;

function names(ids: string[], fallback: string) {
  const values = ids.map(id => nameById.get(id)).filter(Boolean).slice(0, 3);
  return values.length ? values.join(', ') : fallback;
}

export function getConceptSummary(concept: Concept) {
  const generated = generatedDescriptions[concept.id]?.summary?.trim();
  if (generated) return generated;
  const parentNames = names(concept.parents, concept.region);
  const type = /algorithm/i.test(concept.name) ? 'algorithm'
    : /model|regression|network/i.test(concept.name) ? 'modeling concept'
    : /test|testing|analysis|estimation/i.test(concept.name) ? 'analytical method'
    : /distribution|probability|statistic/i.test(concept.name) ? 'statistical concept'
    : /system|database|pipeline|storage/i.test(concept.name) ? 'data systems concept'
    : 'data science concept';
  return `${concept.name} is a ${type} within ${parentNames}. It belongs to the broader ${concept.region} domain and is connected here through the graph's explicit prerequisite and part-of relationships.`;
}

export const relationCount = pairData.records.filter(pair => conceptMap.has(pair.concept_a_id) && conceptMap.has(pair.concept_b_id)).length;

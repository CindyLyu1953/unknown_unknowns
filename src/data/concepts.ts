import universeData from './concept-universe.json';
import pairData from './concept-pairs.json';
import terrainData from './terrain.json';

export type ConceptImportance = 1 | 2 | 3;
export type ContinentId = 'foundations' | 'computation' | 'modeling' | 'decisions' | 'central';

export interface Concept {
  id: string;
  name: string;
  continent: ContinentId;
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

export interface TerrainRegion {
  id: string;
  seed: [number, number];
  polygon: [number, number][];
}

export interface TerrainContour {
  value: number;
  coordinates: number[][][][];
}

export interface TerrainContinent {
  id: Exclude<ContinentId, 'central'>;
  name: string;
  subtitle: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  color: string;
  edge: string;
  domains: string[];
  coastline: number[][][][];
  elevation: TerrainContour[];
  regions: TerrainRegion[];
}

export const WORLD = terrainData.world;
export const TERRAIN_CONTINENTS = terrainData.continents as TerrainContinent[];

export const CONTINENT_META: Record<ContinentId, { name: string; label: string; fill: string }> = {
  foundations: { name: 'Foundations Reach', label: '#8fd6ad', fill: '#142b22' },
  computation: { name: 'Computation Coast', label: '#87c7e8', fill: '#12263a' },
  modeling: { name: 'Modeling Highlands', label: '#c49ae8', fill: '#281a37' },
  decisions: { name: 'Decisions Archipelago', label: '#e6bd67', fill: '#382713' },
  central: { name: 'Data Science Citadel', label: '#f0d998', fill: '#34271a' },
};

const nameById = new Map(universeData.concepts.map(c => [c.id, c.name]));
const featureById = new Map(terrainData.features.map(feature => [feature.id, feature]));
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
  return id
    .split('-')
    .map(word => word.length <= 3 && word !== 'and' ? word.toUpperCase() : word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

function mapImportance(value: number): ConceptImportance {
  if (value >= 3) return 1;
  if (value === 2) return 2;
  return 3;
}

export const concepts: Concept[] = universeData.concepts.flatMap(raw => {
  const feature = featureById.get(raw.id);
  if (!feature) return [];
  const continent: ContinentId = raw.id === 'data-science'
    ? 'central'
    : feature.continent as ContinentId;
  return [{
    id: raw.id,
    name: raw.name,
    continent,
    region: feature.domain === 'data-science' ? 'The Citadel' : titleCase(feature.domain),
    importance: mapImportance(feature.importance),
    prerequisites: prerequisites.get(raw.id) ?? [],
    parents: parents.get(raw.id) ?? [],
    children: children.get(raw.id) ?? [],
    unlocks: unlocks.get(raw.id) ?? [],
    status: raw.status,
    sourceRefs: raw.source_refs,
    x: feature.x,
    y: feature.y,
  }];
});

export const conceptMap = new Map(concepts.map(concept => [concept.id, concept]));

function names(ids: string[], fallback: string) {
  const values = ids.map(id => nameById.get(id)).filter(Boolean).slice(0, 3);
  return values.length ? values.join(', ') : fallback;
}

export function getConceptDescription(concept: Concept) {
  const parentNames = names(concept.parents, concept.region);
  const prerequisiteNames = names(concept.prerequisites, 'your existing intuition and curiosity');
  const childNames = names(concept.children, 'more precise questions inside this territory');
  const unlockNames = names(concept.unlocks, childNames);
  return {
    question: `${concept.name} asks what becomes visible once we look at data through the lens of ${parentNames}. It is less a definition than a particular way of questioning evidence, patterns, and uncertainty.`,
    fascination: `People are drawn to ${concept.name} because it turns an abstract problem into something that can be inspected, challenged, or built. The interesting part is often the shift in what you notice, not merely the technique itself.`,
    world: `Following this path opens routes toward ${unlockNames}. These neighboring places show how one idea can change the questions you are able to ask elsewhere in the universe.`,
    entrance: `The gentlest entrance is through ${prerequisiteNames}. Start with one concrete example, then return to the formal language after the central intuition feels familiar.`,
    relevance: `You may care about ${concept.name} if you enjoy finding hidden structure, testing explanations, or understanding how decisions emerge from imperfect information. Its map position connects it to ${parentNames}.`,
  };
}

export const relationCount = pairData.records.length;

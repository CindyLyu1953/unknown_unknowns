import { createHash } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try {
  loadEnvFile(resolve(ROOT, '.env.local'));
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}
const UNIVERSE_PATH = resolve(ROOT, 'src/data/concept-universe.json');
const PAIRS_PATH = resolve(ROOT, 'src/data/concept-pairs.json');
const OUTPUT_PATH = resolve(ROOT, 'src/data/concept-descriptions.json');
const PROMPT_VERSION = 1;
const DEFAULT_MODEL = 'gpt-5.6-luna';

function parseArgs(argv) {
  const options = { batchSize: 8, force: false, dryRun: false, limit: Infinity, ids: new Set() };
  for (const argument of argv) {
    if (argument === '--force') options.force = true;
    else if (argument === '--dry-run') options.dryRun = true;
    else if (argument.startsWith('--limit=')) options.limit = Number(argument.slice(8));
    else if (argument.startsWith('--batch-size=')) options.batchSize = Number(argument.slice(13));
    else if (argument.startsWith('--id=')) argument.slice(5).split(',').filter(Boolean).forEach(id => options.ids.add(id));
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!Number.isInteger(options.batchSize) || options.batchSize < 1 || options.batchSize > 20) throw new Error('--batch-size must be an integer from 1 to 20.');
  if (!(options.limit === Infinity || Number.isInteger(options.limit) && options.limit > 0)) throw new Error('--limit must be a positive integer.');
  return options;
}

function append(map, key, value) {
  const values = map.get(key) ?? [];
  if (!values.includes(value)) values.push(value);
  map.set(key, values);
}

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
}

function chunks(items, size) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

function sleep(milliseconds) {
  return new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds));
}

function outputText(response) {
  if (typeof response.output_text === 'string') return response.output_text;
  return (response.output ?? []).flatMap(item => item.content ?? []).filter(part => part.type === 'output_text').map(part => part.text).join('');
}

async function loadJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function saveJson(path, value) {
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, path);
}

function makeContexts(universe, pairData) {
  const names = new Map(universe.concepts.map(concept => [concept.id, concept.name]));
  const relations = new Map();
  for (const pair of pairData.records) {
    if (pair.label === 'prerequisite_of') {
      append(relations, `${pair.concept_b_id}:prerequisites`, pair.concept_a_id);
      append(relations, `${pair.concept_a_id}:unlocks`, pair.concept_b_id);
    } else if (pair.label === 'part_of') {
      append(relations, `${pair.concept_a_id}:parents`, pair.concept_b_id);
      append(relations, `${pair.concept_b_id}:children`, pair.concept_a_id);
    }
  }
  const relationNames = (id, kind) => (relations.get(`${id}:${kind}`) ?? []).map(relatedId => names.get(relatedId)).filter(Boolean).slice(0, 12);
  return universe.concepts.filter(concept => concept.id !== 'data-science').map(concept => {
    const context = {
      id: concept.id,
      name: concept.name,
      domain: concept.area,
      partOf: relationNames(concept.id, 'parents'),
      prerequisites: relationNames(concept.id, 'prerequisites'),
      contains: relationNames(concept.id, 'children'),
      unlocks: relationNames(concept.id, 'unlocks'),
    };
    return { ...context, sourceHash: hash({ promptVersion: PROMPT_VERSION, ...context }) };
  });
}

const schema = {
  type: 'object',
  properties: {
    descriptions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The exact concept id supplied in the input.' },
          summary: { type: 'string', description: 'A self-contained, factual explanation of the concept in 45 to 90 English words.' },
        },
        required: ['id', 'summary'],
        additionalProperties: false,
      },
    },
  },
  required: ['descriptions'],
  additionalProperties: false,
};

const instructions = `You write precise concept definitions for an exploratory Data Science knowledge graph.

For every supplied concept, write one self-contained English explanation of 45–90 words. Explain what the concept is, what it represents or does, and its defining mechanism or scope. When useful, distinguish it from a nearby concept. Write for a curious reader with basic technical literacy.

Use the graph context only to disambiguate meaning. Do not list prerequisites or parent relationships in the prose because the interface shows those separately. Do not give learning advice, motivational language, career claims, history, examples invented as facts, or phrases such as “in this graph.” Be factually conservative and do not infer details unsupported by the established meaning of the concept. Return every requested id exactly once.`;

async function requestBatch(apiKey, model, contexts) {
  const body = {
    model,
    store: false,
    instructions,
    input: JSON.stringify({ concepts: contexts.map(({ sourceHash, ...context }) => context) }),
    reasoning: { effort: 'low' },
    text: { verbosity: 'low', format: { type: 'json_schema', name: 'concept_descriptions', strict: true, schema } },
    max_output_tokens: Math.max(1200, contexts.length * 180),
  };
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (response.ok) {
      const payload = await response.json();
      const text = outputText(payload);
      if (!text) throw new Error('The API response contained no output text.');
      return JSON.parse(text).descriptions;
    }
    const message = await response.text();
    if ((response.status === 429 || response.status >= 500) && attempt < 4) {
      await sleep(1000 * 2 ** (attempt - 1));
      continue;
    }
    throw new Error(`OpenAI API ${response.status}: ${message.slice(0, 500)}`);
  }
}

function validateBatch(requested, generated) {
  const requestedIds = new Set(requested.map(context => context.id));
  const results = new Map();
  for (const item of generated) {
    if (!requestedIds.has(item.id)) throw new Error(`Unexpected concept id in response: ${item.id}`);
    if (results.has(item.id)) throw new Error(`Duplicate concept id in response: ${item.id}`);
    const summary = item.summary.trim().replace(/\s+/g, ' ');
    const wordCount = summary.split(/\s+/).length;
    if (wordCount < 30 || wordCount > 110) throw new Error(`${item.id} summary has ${wordCount} words; expected 30–110.`);
    results.set(item.id, summary);
  }
  const missing = requested.filter(context => !results.has(context.id));
  if (missing.length) throw new Error(`Missing concept ids in response: ${missing.map(item => item.id).join(', ')}`);
  return results;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const [universe, pairData, existing] = await Promise.all([loadJson(UNIVERSE_PATH), loadJson(PAIRS_PATH), loadJson(OUTPUT_PATH)]);
  const contexts = makeContexts(universe, pairData);
  const selected = contexts.filter(context => !options.ids.size || options.ids.has(context.id));
  const pending = selected.filter(context => options.force || existing.descriptions?.[context.id]?.sourceHash !== context.sourceHash).slice(0, options.limit);
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;

  console.log(`${contexts.length} concepts total; ${pending.length} selected for generation with ${model}.`);
  if (options.ids.size) {
    const unknown = [...options.ids].filter(id => !contexts.some(context => context.id === id));
    if (unknown.length) throw new Error(`Unknown concept ids: ${unknown.join(', ')}`);
  }
  if (!pending.length) return;
  if (options.dryRun) {
    console.log(JSON.stringify(pending.slice(0, Math.min(3, pending.length)), null, 2));
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set. See README.md for a shell-safe setup command.');

  const output = {
    meta: { promptVersion: PROMPT_VERSION, model, generatedAt: existing.meta?.generatedAt ?? null, completed: Object.keys(existing.descriptions ?? {}).length, total: contexts.length },
    descriptions: { ...(existing.descriptions ?? {}) },
  };
  let completedThisRun = 0;
  for (const batch of chunks(pending, options.batchSize)) {
    const generated = validateBatch(batch, await requestBatch(apiKey, model, batch));
    const generatedAt = new Date().toISOString();
    for (const context of batch) {
      output.descriptions[context.id] = { summary: generated.get(context.id), sourceHash: context.sourceHash, model, generatedAt };
    }
    completedThisRun += batch.length;
    output.meta = { promptVersion: PROMPT_VERSION, model, generatedAt, completed: Object.keys(output.descriptions).length, total: contexts.length };
    await saveJson(OUTPUT_PATH, output);
    console.log(`Saved ${completedThisRun}/${pending.length} generated descriptions (${output.meta.completed}/${contexts.length} total).`);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

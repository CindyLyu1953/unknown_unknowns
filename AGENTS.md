# Unknown Unknowns

React + Vite + Tailwind CSS application for exploring a structured Data Science concept graph.

## Commands

- `pnpm dev` — development server
- `pnpm build` — production build
- `pnpm exec tsc --noEmit` — type check

## Structure

- `src/MinimalApp.tsx` — application shell, search, directions, and concept details
- `src/components/ConceptClusterGraph.tsx` — zoomable clustered concept graph
- `src/data/concepts.ts` — graph normalization and deterministic cluster layout
- `src/data/concept-universe.json` — 440 concepts
- `src/data/concept-pairs.json` — prerequisite and part-of relations
- `src/navigation/route-engine.ts` — weighted concept-to-concept routing

## Product constraints

- Keep the interface minimal and readable.
- Concepts are grouped by knowledge domain, not simulated geography.
- Single-click selects a concept; double-click opens details.
- Only `prerequisite_of` and `part_of` are first-class relationship types.

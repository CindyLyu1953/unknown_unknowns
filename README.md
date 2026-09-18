# Unknown Unknowns — Data Science Universe

An exploratory concept graph for discovering what to learn next. Search any data science concept to open a focused local network, progressively reveal nearby ideas, inspect prerequisite and part-of relationships, or request point-to-point learning directions. The generic `Data Science` root is intentionally hidden, leaving 439 explorable concepts.

## Open the app

Double-click **Open Data Science Universe.command**. The launcher serves the production build locally at `http://127.0.0.1:4190/`.

Do not open `index.html` directly with `file://`; it is the Vite source entry.

## Development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

## Generate higher-quality concept descriptions

The app reads generated copy from `src/data/concept-descriptions.json` and falls back to a short local description when an entry is missing. Generation happens locally; the browser never receives the API key.

Copy `.env.example` to `.env.local`, put the key after `OPENAI_API_KEY=`, then run the incremental generator. `.env.local` is ignored by Git and is loaded only by the local generation script.

```bash
npm run generate:descriptions
```

The script saves every completed batch, so it is safe to stop and resume. Useful options:

```bash
npm run generate:descriptions -- --dry-run --limit=3
npm run generate:descriptions -- --id=causal-inference,probability
npm run generate:descriptions -- --force --id=causal-inference
```

Set `OPENAI_MODEL` to override the default model. Commit the generated JSON, but never commit an API key or `.env` file.

The structured graph data lives in `src/data/`: 440 concepts and 475 `prerequisite_of` / `part_of` relationships.

## GitHub Pages

Pushes to `main` automatically build and deploy the site through `.github/workflows/deploy.yml`.

Before the first deployment, open the repository's **Settings → Pages** and set **Source** to **GitHub Actions**. The published site is available at:

`https://cindylyu1953.github.io/unknown_unknowns/`

# Unknown Unknowns — Data Science Universe

An exploratory concept graph for discovering what to learn next. Search any data science concept to open a focused local network, progressively reveal nearby ideas, inspect prerequisite and part-of relationships, or request point-to-point learning directions. The generic `Data Science` root is intentionally hidden, leaving 439 explorable concepts.

## Open the app

Double-click **Open Data Science Universe.command**. The launcher serves the production build locally at `http://127.0.0.1:4190/`.

Do not open `index.html` directly with `file://`; it is the Vite source entry.

## Development

```bash
pnpm install
pnpm dev
```

## Production build

```bash
pnpm build
```

The structured graph data lives in `src/data/`: 440 concepts and 475 `prerequisite_of` / `part_of` relationships.

## GitHub Pages

Pushes to `main` automatically build and deploy the site through `.github/workflows/deploy.yml`.

Before the first deployment, open the repository's **Settings → Pages** and set **Source** to **GitHub Actions**. The published site is available at:

`https://cindylyu1953.github.io/unknown_unknowns/`

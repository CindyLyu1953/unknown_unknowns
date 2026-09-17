# Unknown Unknowns — Data Science Universe

An exploratory concept graph for discovering what to learn next. The interface groups 440 data science concepts into 12 logical domains and supports search, concept details, prerequisite relationships, and point-to-point learning directions.

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

# Data Science Universe

Double-click **Open Data Science Universe.command** to launch the original atlas, or **Open Minimal Data Science Universe.command** to launch the minimal interface.

Do not open `index.html` directly with `file://`; it is the Vite source entry. The production app lives in `dist/` and the launcher serves it locally at `http://127.0.0.1:4190/`.

## Development

```bash
pnpm install
pnpm dev
```

## Production build

```bash
pnpm build
```

The map is driven by the structured files in `src/data/`: 440 concepts, 475 relationships, and offline-generated D3 terrain.

UI variants can also be opened directly:

- Original atlas: `http://127.0.0.1:4190/?variant=world`
- Minimal interface: `http://127.0.0.1:4190/?variant=minimal`

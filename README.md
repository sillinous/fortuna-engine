# Fortuna Engine v10.4 — Unified Metamodel Release

## Quick Deploy

### Option A: Node.js Hosting (Hostinger Node.js, VPS, etc.)

```bash
npm install
npm run build
npm start
```

The app runs on port 3000 (set `PORT` env var to override).
`server.js` serves the built SPA with proper caching headers.

### Option B: Apache/PHP Shared Hosting (Hostinger Shared)

Upload the contents of `dist/` directly to your `public_html/` directory:

```
public_html/
├── index.html
├── .htaccess          ← SPA routing + caching + compression
├── assets/
│   ├── index-*.js     ← bundled app (467 KB gzipped)
│   └── index-*.css    ← bundled styles
├── api/               ← PHP backend (auth, state sync, AI advisor)
│   ├── config.php     ← DB credentials (edit this!)
│   ├── core.php
│   ├── auth.php
│   ├── state.php
│   ├── advisor.php
│   ├── workspace.php
│   └── sql/
│       ├── schema.sql
│       └── schema-collab.sql
├── manifest.json      ← PWA manifest
├── sw.js              ← Service worker (offline support)
└── offline.html
```

**After uploading dist/ contents:**

1. Edit `api/config.php` with your database credentials
2. Run `api/sql/schema.sql` in your MySQL database
3. Run `api/sql/schema-collab.sql` for workspace features
4. Visit your domain

### Rebuilding From Source

```bash
npm install          # Install dependencies
npm run build        # TypeScript check + Vite bundle → dist/
npm run preview      # Local preview of built output
```

## Project Structure

```
fortuna-engine/
├── src/                    ← TypeScript/React source (50,830 lines)
│   ├── engine/             ← 50 calculation engines
│   │   ├── storage.ts      ← Unified metamodel (706 lines, 24 types)
│   │   ├── tax-calculator.ts ← Entity-aware tax computation
│   │   ├── multi-entity.ts ← Cascade engine (canonical EntityType)
│   │   ├── pnl-engine.ts   ← P&L with entity filter
│   │   ├── cash-flow.ts    ← Cash flow with entity filter
│   │   ├── cpa-export.ts   ← Per-entity CPA packages
│   │   └── ...             ← 44 more engines
│   ├── views/              ← 40 view modules
│   ├── components/         ← 13 shared components
│   ├── hooks/              ← State management (useFortuna)
│   └── context/            ← React context providers
├── public/                 ← Static assets (copied to dist/ at build)
│   ├── api/                ← PHP backend
│   └── .htaccess           ← Apache SPA routing
├── dist/                   ← Pre-built output (ready to deploy)
├── package.json            ← Dependencies + scripts
├── vite.config.ts          ← Build configuration
├── tailwind.config.js      ← Tailwind CSS theme
├── tsconfig.json           ← TypeScript config
└── server.js               ← Express server (Node.js hosting)
```

## v10.4 Metamodel Changes

- Unified EntityType across all 50 engines
- Household model with spouse support for joint filers
- Entity-aware tax calculator with per-entity P&L
- 10 orphaned data types now persisted in FortunaState
- Universal attribution on every financial record
- Schema v9 auto-migration on load

## Environment

- Node.js >= 18
- PHP >= 7.4 (for API backend)
- MySQL 5.7+ (for cloud sync)
- Apache with mod_rewrite (for shared hosting)

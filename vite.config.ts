import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Core engines (needed by Dashboard)
          'engine-core': [
            './src/engine/tax-calculator.ts',
            './src/engine/storage.ts',
            './src/engine/health-score.ts',
            './src/engine/strategy-detector.ts',
            './src/engine/session-digest.ts',
          ],
          // Heavy specialized engines (lazy-loaded with views)
          'engine-analysis': [
            './src/engine/unified-intelligence.ts',
            './src/engine/multi-year-tax.ts',
            './src/engine/entity-optimizer.ts',
            './src/engine/retirement-optimizer.ts',
            './src/engine/depreciation-engine.ts',
            './src/engine/filing-export.ts',
          ],
          'engine-portfolio': [
            './src/engine/cost-basis.ts',
            './src/engine/defi-tracker.ts',
          ],
          'engine-api': [
            './src/engine/api-cache.ts',
            './src/engine/market-data.ts',
            './src/engine/exchange-rates.ts',
            './src/engine/stock-quotes.ts',
            './src/engine/sec-edgar.ts',
            './src/engine/api-settings.ts',
          ],
          'engine-quickbooks': [
            './src/engine/qb-iif-parser.ts',
            './src/engine/qb-ofx-parser.ts',
            './src/engine/qb-coa-mapper.ts',
            './src/engine/qb-iif-exporter.ts',
          ],
          'engine-fintech': [
            './src/engine/fintech-models.ts',
            './src/engine/fintech-adapters.ts',
            './src/engine/fintech-bridge.ts',
            './src/engine/fintech-enrichment.ts',
            './src/engine/fintech-manager.ts',
          ],
          'engine-operations': [
            './src/engine/bank-feed.ts',
            './src/engine/cash-flow.ts',
            './src/engine/audit-defense.ts',
            './src/engine/income-forecast.ts',
            './src/engine/state-arbitrage.ts',
          ],
          // React + vendor
          'vendor-react': ['react', 'react-dom'],
        },
      },
    },
  },
});

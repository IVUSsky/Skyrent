import { defineConfig } from 'vitest/config';

// Vitest config for the SKYRENT backend (CommonJS / Node).
// Uses .mjs so Vite loads it natively as ESM (the backend package.json has no
// "type": "module", so a .js config would warn under configLoader: 'native').
// - environment: 'node'   -> no DOM, matches the server runtime.
// - globals: true          -> describe/it/expect available without imports,
//                            so test files can stay CommonJS (require) like the rest of the backend.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['**/*.test.js'],
  },
});

import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    // Build-Skripte laufen in Node, nicht im Browser. Ohne diesen Block meldet
    // no-undef jedes `process` als Fehler, obwohl es dort völlig korrekt ist.
    files: ['vite.config.js', 'prerender.js', 'eslint.config.js', 'src/pages/SeedRunners/gen/tools/**', 'src/pages/SacrificeSigils/tools/**', 'src/pages/SacrificeSigils/__tests__/**'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // Großgeschriebenes = Komponente oder Konstante. Ohne eslint-plugin-react zählt
      // `<Icon />` nicht als Verwendung, deshalb würde jede Komponente, die eine andere
      // Komponente als Prop bekommt und nur im JSX rendert, fälschlich als ungenutzt
      // gemeldet. argsIgnorePattern zieht dieselbe Ausnahme auf Funktionsparameter nach —
      // varsIgnorePattern greift dort nicht.
      'no-unused-vars': ['error', {
        varsIgnorePattern: '^[A-Z_]',
        argsIgnorePattern: '^[A-Z_]',
      }],
    },
  },
])

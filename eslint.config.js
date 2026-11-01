import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'dev-dist', 'coverage']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    rules: {
      // React Compiler rules (new in eslint-plugin-react-hooks 7). This project does not use
      // the compiler, and most findings are the deliberate "latest value in a ref" pattern in
      // autosave and the editor. They stay visible as warnings until the planned state-store
      // refactor (docs/ARCHITECTURE_VISION.md, Phase 0) removes them; then make them errors.
      // `npm run lint` caps warnings at today's count (--max-warnings in package.json), so new
      // ones fail CI. Lower the cap whenever warnings are fixed.
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      // A leading underscore marks values that are intentionally unused, such as
      // react-markdown's `node` prop being dropped before spreading props onto DOM elements.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    files: ['*.config.{js,ts}', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['eslint.config.js'],
    extends: [js.configs.recommended],
  },
])

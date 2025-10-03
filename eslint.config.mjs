import js from "@eslint/js"
import globals from "globals"
import tseslint from "typescript-eslint"
import { defineConfig } from "eslint/config"
import cspellESLintPluginRecommended from '@cspell/eslint-plugin/recommended'

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: { globals: globals.browser }
  },
  tseslint.configs.recommended,
  cspellESLintPluginRecommended,
  {
    rules: {
      "@cspell/spellchecker": ["warn", { cspell: { words: ['knrdl'] } }],
    }
  }
])

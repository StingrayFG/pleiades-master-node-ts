import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts}'],
    plugins: { js },
    extends: ['js/recommended', 'plugin:@typescript-eslint/recommended'],
    languageOptions: { globals: globals.browser },
    rules: {
      'no-unused-vars': 'off'
    }
  },
  tseslint.configs.recommended
]);

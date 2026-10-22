import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  // public/ocr is the OCR engine and language data copied there by scripts/copy-ocr-assets.mjs.
  { ignores: ['dist', 'lint_results.json', 'public/ocr'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: '18.3' } },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      'react/prop-types': 'off',
      'no-console': 'warn',
    },
  },
  {
    files: [
      '**/components/three/**',
      '**/components/SoilCanvas.jsx',
      '**/components/SoilSequenceCanvas.jsx',
      '**/components/HomeCanvas.jsx',
      '**/components/InteractiveCropsField.jsx',
      '**/components/SubsurfaceRoots.jsx',
      '**/components/Crop3DModels.jsx',
      '**/components/FertilizerParticles3D.jsx',
      '**/*3D*.jsx',
    ],
    rules: {
      'react/no-unknown-property': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/exhaustive-deps': 'off',
    },
  },
  {
    files: ['*.config.js', 'scripts/**/*.mjs', 'tests/**/*.mjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node },
    rules: { 'no-console': 'off' },
  },
]

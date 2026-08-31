import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  /* `verifica/.schermate.cjs` non e' codice sorgente: e' il fascio che
     esbuild produce per far girare il banco delle schermate su Node,
     ed e' scritto dentro il progetto dal comando documentato in
     CORREZIONI-AUDIT.md. Lint su un fascio minificato che contiene React
     intero vuol dire 234 errori che non sono errori — e un lint che grida
     al lupo e' un lint che nessuno guarda piu'. Stesso ragionamento del
     blocco sui file di verifica qui sotto. */
  { ignores: ['dist', 'node_modules', 'verifica/.schermate.cjs'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // il codice usa spesso `catch (e) {}` come fallback voluto
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  /* I file di verifica girano su Node, non nel browser: senza questo
     blocco `npm run lint` segnalava venti errori su `console`, `process`
     e `setTimeout` che non erano errori — e un lint che grida al lupo
     ogni volta è un lint che nessuno guarda più. Qui `console.log` è il
     modo in cui i controlli riportano l'esito, quindi la regola che lo
     vieta non si applica. */
  {
    files: ['verifica/**/*.mjs', 'verifica/**/*.js', 'verifica/**/*.jsx'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-console': 'off',
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
    },
  },
];

import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import react from 'eslint-plugin-react';

export default [
  /* `verifica/.schermate.cjs` non e' codice sorgente: e' il fascio che
     esbuild produce per far girare il banco delle schermate su Node,
     ed e' scritto dentro il progetto dal comando documentato in
     CORREZIONI-AUDIT.md. Lint su un fascio minificato che contiene React
     intero vuol dire 234 errori che non sono errori. Stesso ragionamento del
     blocco sui file di verifica qui sotto, dove la frase per esteso c'e'
     gia': un lint che grida al lupo e' un lint che nessuno guarda piu'. */
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
    plugins: { 'react-hooks': reactHooks, react },
    rules: {
      ...reactHooks.configs.recommended.rules,
      /* SENZA QUESTA REGOLA `no-unused-vars` MENTE.

         ESLint da solo non sa che `<Check />` è un uso di `Check`: vede
         l'identificativo importato, non lo ritrova in nessuna espressione
         JavaScript, e lo segnala come inutilizzato. Erano 79 avvisi su 83,
         tutti falsi, su import che l'app usa davvero — `Check`, `Pianta`,
         `OggiScreen`, perfino `App` dentro `main.jsx`.

         Non è un dettaglio di forma: chi si fosse fidato dell'elenco e
         avesse «ripulito gli import inutilizzati» avrebbe smontato
         l'interfaccia riga per riga, con il lint che diceva grazie.
         `react/jsx-uses-vars` insegna a `no-unused-vars` a leggere il JSX,
         quindi da qui in poi un avviso di import inutilizzato è vero. */
      'react/jsx-uses-vars': 'error',
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

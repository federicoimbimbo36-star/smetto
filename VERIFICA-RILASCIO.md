# Verifica del rilascio

Prima di rifare il collaudo del logout, bisogna sapere **quale build è online**.
Finché quella risposta è una supposizione, un collaudo che fallisce non dice se
il codice è sbagliato o se non è mai arrivato.

## 1. Prima del deploy: esporre l'identificativo

In Vercel: **Settings → Environment Variables → attiva «Automatically expose
System Environment Variables»**.

Senza quella opzione, `VERCEL_GIT_COMMIT_SHA` non arriva alla build e l'app non
può sapere da quale commit viene. In alternativa puoi aggiungere a mano una
variabile `VITE_VERCEL_GIT_COMMIT_SHA`: la build guarda tutte e due.

## 2. Estrarre e mettere i file al posto giusto

Estrai lo ZIP. Dentro c'è una cartella `smetto/`: **copia il suo contenuto**
nella root effettiva del repository — non la cartella, quello che c'è dentro.

Nella cartella che Vercel compila devono trovarsi **direttamente**:

```
package.json
src/
vite.config.js
```

Se sono dentro un altro livello (`smetto/package.json`), Vercel non li vede.

## 3. Controllare la Root Directory in Vercel

Settings → General → **Root Directory** deve puntare a quella cartella.
Se i file stanno nella root del repository, il campo va lasciato vuoto.

## 4. Dopo il deploy, confrontare la versione

Apri l'app, vai in **Profilo** e guarda in fondo:

```
Versione: abc1234
```

Sono i primi 7 caratteri del commit. Confrontali con il commit che Vercel segna
come pubblicato in quel deployment: **devono coincidere**. Se non coincidono
stai guardando una build vecchia, e non ha senso collaudare niente finché è
così (svuota la cache di Safari, o riapri la scheda da zero).

Se leggi invece:

```
Versione: non disponibile
```

**non** vuol dire che l'app gira in locale, e non vuol dire che il deploy è
andato male. Vuol dire una cosa sola: l'identificativo non è stato esposto alla
build. Torna al punto 1, attiva l'opzione (o aggiungi
`VITE_VERCEL_GIT_COMMIT_SHA`) e rifai il deploy. Finché resta così il confronto
del punto 4 non si può fare, ma l'app funziona normalmente.

## 5. Solo a quel punto, il test del logout

Con la versione confermata, si ripete la prova sulle due schede Safari:

1. due schede sullo stesso account;
2. logout nella scheda A;
3. la scheda B deve tornare al login — anche se era in sfondo, anche
   **ricaricandola**;
4. un altro telefono o browser con lo stesso account deve restare dentro.

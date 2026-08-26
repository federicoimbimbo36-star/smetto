# Pubblicare Smetto

Mettere l'app online con un indirizzo che si può mandare a chiunque, senza
scrivere nessun comando. Venti minuti, zero euro.

```
la cartella sul computer  →  GitHub  →  Vercel  →  un link che funziona per tutti
```

---

## 0. Prima di tutto: i due interruttori delle email su Supabase

È l'unico passaggio che, se sbagli, fa sembrare tutto a posto fino al momento in
cui qualcuno prova a registrarsi.

In Smetto si entra con numero di telefono e password, ma sotto il cofano Supabase
usa comunque un indirizzo email — finto, che non riceverà mai posta. Servono due
cose insieme: che il metodo email sia **acceso**, e che non pretenda di farsi
confermare.

1. [supabase.com/dashboard](https://supabase.com/dashboard) → progetto `smetto`
2. Menù a sinistra: **Authentication → Sign In / Providers**
3. Apri la riga **Email** e sistema i due interruttori:

| Interruttore | Come deve stare | Dov'è |
|---|---|---|
| **Enable Email provider** | **acceso** | in cima al riquadro, è quello che accende tutto il metodo |
| **Confirm email** | **spento** | poco sotto, dentro lo stesso riquadro |

4. Premi **Save**.

> **Sono due interruttori diversi e vicini.** Confonderli è l'errore più facile
> di tutta la guida. I messaggi d'errore che ne escono però sono diversi, quindi
> se sbagli lo capisci — vedi «Se qualcosa non funziona» in fondo.

---

## 1. Scompatta la cartella

Scompatta `smetto-corretto.zip`. Dentro la cartella `smetto` devi vedere
`index.html`, `package.json` e le cartelle `src` e `public`. Se vedi un'altra
cartella `smetto`, entra ancora: è quella dentro che serve.

## 2. Crea l'archivio su GitHub

1. [github.com/new](https://github.com/new)
2. **Repository name**: `smetto`
3. **Public** o **Private**: funzionano tutti e due
4. **Non** spuntare *Add a README file* né le altre caselle
5. **Create repository**

Niente README perché altrimenti l'archivio non è più vuoto e GitHub nasconde il
link per caricare i file trascinandoli, che serve al passaggio dopo.

## 3. Trascina dentro i file

Nella pagina piena di comandi, in mezzo, c'è la riga *«…or upload an existing
file»*: clicca **uploading an existing file**.

1. Apri la cartella `smetto` di fianco alla finestra del browser
2. Seleziona **tutto quello che c'è dentro** (Ctrl+A / Cmd+A)
3. Trascina la selezione nel riquadro tratteggiato
4. **Commit changes**

> **L'errore che fanno tutti.** Va trascinato *il contenuto* della cartella, non
> la cartella `smetto` stessa: altrimenti finisce tutto un livello più in basso e
> la pubblicazione fallisce. Controllo: a caricamento finito, nell'elenco
> dell'archivio devi vedere `index.html` e `package.json`. Se vedi una sola riga
> `smetto`, rifai.

## 4. Entra in Vercel con GitHub

1. [vercel.com/signup](https://vercel.com/signup)
2. **Continue with GitHub** → **Authorize**
3. Se chiede il tipo di account, scegli quello personale **Hobby** (è il gratuito)

## 5. Importa e pubblica

1. **Add New… → Project**
2. Trova `smetto` → **Import**
3. Vercel scrive da solo *Framework Preset: Vite*. **Non toccare niente.**
4. **Deploy**, e aspetta un minuto

Sotto compare l'indirizzo, tipo `smetto-a1b2c3.vercel.app`. È l'app online.

> Se `smetto` non compare nell'elenco: **Adjust GitHub App Permissions** e dai a
> Vercel il permesso di vedere quell'archivio.

## 6. Installala sul telefono

Aperta dal browser funziona già, ma aggiunta alla schermata Home diventa un'app
vera: icona sua, schermo intero, niente barra degli indirizzi.

- **iPhone** (dev'essere Safari, con Chrome non funziona): bottone Condividi →
  **Aggiungi alla schermata Home**
- **Android**: Chrome, menù ⋮ → **Installa app**

## 7. Falla usare a qualcun altro

Manda il link. Ognuno si registra col proprio numero: i dati restano separati.
Per il gruppo: uno lo crea dalla scheda **Gruppo**, copia il codice di sei
lettere e lo manda; gli altri entrano da **Entra con un codice**.

---

## Come si aggiorna dopo

Niente da ripetere. Vercel guarda l'archivio su GitHub e ripubblica da solo in
circa un minuto appena cambia qualcosa.

Per caricare file nuovi: nell'archivio su GitHub, **Add file → Upload files**,
trascina, **Commit changes**. Stessi nomi = sostituiscono i vecchi. L'indirizzo
dell'app resta identico.

---

## Se qualcosa non funziona

I messaggi delle prime tre voci escono tutti dalla schermata di registrazione, ma
vogliono dire cose diverse: quale ti è uscito dice quale interruttore guardare.

**«Non è stato possibile creare l'account: Email signups are disabled»** — il
metodo email è *spento*. Passaggio 0: accendi **Enable Email provider**, quello in
cima al riquadro Email. Capita di spegnere quello mentre si cerca **Confirm
email**, che sta poco sotto. Dopo il **Save** non serve ripubblicare: ricarica la
pagina dell'app e riprova.

**«…serve disattivare la conferma email nelle impostazioni Supabase»** —
l'opposto: il metodo è acceso ma pretende la conferma. Passaggio 0, spegni
**Confirm email**.

**«Signups not allowed for this instance»** — diverso ancora: sono bloccate
*tutte* le registrazioni. Stessa pagina del passaggio 0, in cima, sezione **User
Signups** → **Allow new users to sign up** dev'essere accesa.

**«Build failed» su Vercel, o pagina bianca** — quasi sempre è il passaggio 3:
caricata la cartella invece del contenuto. Se nell'elenco dei file su GitHub non
vedi `index.html` in cima, è quello.

**«Errore di connessione»** — l'app non raggiunge il database: controlla che il
progetto Supabase non sia in pausa (qui sotto).

**Funzionava e dopo qualche settimana no** — Supabase mette in pausa i progetti
gratuiti dopo circa sette giorni senza nessun utilizzo. I dati non si perdono:
pannello Supabase → **Resume project**, e torna tutto. C'è un anno di tempo. Con
un uso quotidiano non succede.

**Le notifiche non arrivano col telefono in tasca** — non è rotto: dal browser non
possono arrivare, è un limite del web. Con l'app aperta le tappe arrivano lo
stesso. Per averle in tasca serve Capacitor (vedi `README.md`).

---

## Due cose da sapere

- **Il link è pubblico**: chiunque ce l'abbia può registrarsi. I dati di ognuno
  restano suoi e nel gruppo si entra solo col codice, ma è bene saperlo.
- **Gratis vuol dire uso personale**: il piano Hobby di Vercel è per progetti
  personali, non commerciali.

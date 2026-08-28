/* Il marchio: un germoglio a due foglie.
   Sostituisce la sigaretta con la brace accesa del vecchio logo — un'app
   che aiuta a smettere non ha motivo di mettere una sigaretta in copertina,
   e la foglia dice la stessa cosa che dice tutta l'interfaccia: quello che
   stai facendo è una cosa che cresce.
   Stessa forma di foglia della schermata Percorso (vedi Pianta.jsx): il
   marchio e l'illustrazione parlano la stessa lingua. */
const FOGLIA = 'M0 0 C7 -9 19 -12 28 -6 C21 3 8 6 0 0 Z';

export default function BrandMark({ size = 34, sfondo = true }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      {sfondo && <circle cx="16" cy="16" r="16" fill="#DDEDE6" />}
      <path d="M16 26 C15.3 21.5 15.5 17 16 11.5" stroke="#286B5A" strokeWidth="2.4" strokeLinecap="round" />
      <path d={FOGLIA} fill="#286B5A" transform="translate(15.4 19) scale(-0.36 0.36)" />
      <path d={FOGLIA} fill="#286B5A" opacity="0.58" transform="translate(16.4 13.6) scale(0.4 0.4)" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* main.jsx — punto di ingresso                                        */
/*                                                                     */
/* L'ORDINE QUI SOTTO NON È A CASO:                                    */
/* installStorage va importato PRIMA di App, perché App (e tutto quello */
/* che importa: auth, groups, ecc.) usa window.storage fin dal primo   */
/* render. Se l'ordine si invertisse, il primo giro di readStore/      */
/* writeStore troverebbe window.storage ancora undefined e fallirebbe. */
/* ------------------------------------------------------------------ */

import { createRoot } from 'react-dom/client';
import './installStorage';   // definisce window.storage — DEVE essere il primo import
import App from './App';

createRoot(document.getElementById('root')).render(<App />);

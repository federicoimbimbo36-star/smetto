/* ------------------------------------------------------------------ */
/*  PREFISSI TELEFONICI INTERNAZIONALI                                 */
/*                                                                     */
/*  Ordine: l'Italia per prima, poi i paesi da cui vengono le comunità  */
/*  più numerose che vivono in Italia, poi il resto in ordine           */
/*  alfabetico. Non è campanilismo: chi si registra da qui trova il suo */
/*  prefisso senza cercare, e chi non lo trova nei primi lo cerca col   */
/*  campo di ricerca — che accetta sia il nome sia il numero.           */
/*                                                                     */
/*  `min` e `max` sono le cifre del numero LOCALE, senza prefisso e     */
/*  senza lo zero iniziale. Servono a dire «manca una cifra» prima di   */
/*  mandare una registrazione che il backend rifiuterebbe. Dove non si  */
/*  hanno dati certi si tiene una forbice larga: meglio accettare un    */
/*  numero strano che rifiutarne uno buono.                             */
/* ------------------------------------------------------------------ */

const P = (iso, bandiera, nome, prefisso, min = 6, max = 14) =>
  ({ iso, bandiera, nome, prefisso, min, max });

export const PREFISSI = [
  // ---- il paese dell'app ----
  P('IT', '🇮🇹', 'Italia', '+39', 9, 11),

  // ---- le comunità straniere più numerose in Italia ----
  P('RO', '🇷🇴', 'Romania', '+40', 9, 9),
  P('AL', '🇦🇱', 'Albania', '+355', 8, 9),
  P('MA', '🇲🇦', 'Marocco', '+212', 9, 9),
  P('CN', '🇨🇳', 'Cina', '+86', 11, 11),
  P('UA', '🇺🇦', 'Ucraina', '+380', 9, 9),
  P('IN', '🇮🇳', 'India', '+91', 10, 10),
  P('BD', '🇧🇩', 'Bangladesh', '+880', 9, 10),
  P('PH', '🇵🇭', 'Filippine', '+63', 9, 10),
  P('EG', '🇪🇬', 'Egitto', '+20', 9, 10),
  P('PK', '🇵🇰', 'Pakistan', '+92', 10, 10),
  P('MD', '🇲🇩', 'Moldavia', '+373', 8, 8),
  P('NG', '🇳🇬', 'Nigeria', '+234', 8, 10),
  P('SN', '🇸🇳', 'Senegal', '+221', 9, 9),
  P('PE', '🇵🇪', 'Perù', '+51', 8, 9),
  P('EC', '🇪🇨', 'Ecuador', '+593', 8, 9),
  P('LK', '🇱🇰', 'Sri Lanka', '+94', 9, 9),
  P('TN', '🇹🇳', 'Tunisia', '+216', 8, 8),
  P('PL', '🇵🇱', 'Polonia', '+48', 9, 9),
  P('BR', '🇧🇷', 'Brasile', '+55', 10, 11),

  // ---- il resto, in ordine alfabetico ----
  P('AF', '🇦🇫', 'Afghanistan', '+93', 9, 9),
  P('DZ', '🇩🇿', 'Algeria', '+213', 9, 9),
  P('AD', '🇦🇩', 'Andorra', '+376', 6, 9),
  P('AO', '🇦🇴', 'Angola', '+244', 9, 9),
  P('SA', '🇸🇦', 'Arabia Saudita', '+966', 9, 9),
  P('AR', '🇦🇷', 'Argentina', '+54', 10, 11),
  P('AM', '🇦🇲', 'Armenia', '+374', 8, 8),
  P('AU', '🇦🇺', 'Australia', '+61', 9, 9),
  P('AT', '🇦🇹', 'Austria', '+43', 9, 13),
  P('AZ', '🇦🇿', 'Azerbaigian', '+994', 9, 9),
  P('BH', '🇧🇭', 'Bahrein', '+973', 8, 8),
  P('BE', '🇧🇪', 'Belgio', '+32', 9, 9),
  P('BY', '🇧🇾', 'Bielorussia', '+375', 9, 9),
  P('BO', '🇧🇴', 'Bolivia', '+591', 8, 8),
  P('BA', '🇧🇦', 'Bosnia ed Erzegovina', '+387', 8, 9),
  P('BG', '🇧🇬', 'Bulgaria', '+359', 8, 9),
  P('BF', '🇧🇫', 'Burkina Faso', '+226', 8, 8),
  P('KH', '🇰🇭', 'Cambogia', '+855', 8, 9),
  P('CM', '🇨🇲', 'Camerun', '+237', 9, 9),
  P('CA', '🇨🇦', 'Canada', '+1', 10, 10),
  P('CV', '🇨🇻', 'Capo Verde', '+238', 7, 7),
  P('TD', '🇹🇩', 'Ciad', '+235', 8, 8),
  P('CL', '🇨🇱', 'Cile', '+56', 9, 9),
  P('CY', '🇨🇾', 'Cipro', '+357', 8, 8),
  P('CO', '🇨🇴', 'Colombia', '+57', 10, 10),
  P('CG', '🇨🇬', 'Congo', '+242', 9, 9),
  P('CD', '🇨🇩', 'Congo (Rep. Dem.)', '+243', 9, 9),
  P('KR', '🇰🇷', 'Corea del Sud', '+82', 9, 10),
  P('CI', '🇨🇮', 'Costa d\u2019Avorio', '+225', 10, 10),
  P('CR', '🇨🇷', 'Costa Rica', '+506', 8, 8),
  P('HR', '🇭🇷', 'Croazia', '+385', 8, 9),
  P('CU', '🇨🇺', 'Cuba', '+53', 8, 8),
  P('DK', '🇩🇰', 'Danimarca', '+45', 8, 8),
  P('DO', '🇩🇴', 'Rep. Dominicana', '+1809', 7, 7),
  P('AE', '🇦🇪', 'Emirati Arabi Uniti', '+971', 9, 9),
  P('EE', '🇪🇪', 'Estonia', '+372', 7, 8),
  P('ET', '🇪🇹', 'Etiopia', '+251', 9, 9),
  P('RU', '🇷🇺', 'Federazione Russa', '+7', 10, 10),
  P('FI', '🇫🇮', 'Finlandia', '+358', 9, 10),
  P('FR', '🇫🇷', 'Francia', '+33', 9, 9),
  P('GE', '🇬🇪', 'Georgia', '+995', 9, 9),
  P('DE', '🇩🇪', 'Germania', '+49', 10, 11),
  P('GH', '🇬🇭', 'Ghana', '+233', 9, 9),
  P('JM', '🇯🇲', 'Giamaica', '+1876', 7, 7),
  P('JP', '🇯🇵', 'Giappone', '+81', 9, 10),
  P('JO', '🇯🇴', 'Giordania', '+962', 9, 9),
  P('GR', '🇬🇷', 'Grecia', '+30', 10, 10),
  P('GT', '🇬🇹', 'Guatemala', '+502', 8, 8),
  P('GN', '🇬🇳', 'Guinea', '+224', 9, 9),
  P('HN', '🇭🇳', 'Honduras', '+504', 8, 8),
  P('ID', '🇮🇩', 'Indonesia', '+62', 9, 12),
  P('IR', '🇮🇷', 'Iran', '+98', 10, 10),
  P('IQ', '🇮🇶', 'Iraq', '+964', 10, 10),
  P('IE', '🇮🇪', 'Irlanda', '+353', 9, 9),
  P('IS', '🇮🇸', 'Islanda', '+354', 7, 7),
  P('IL', '🇮🇱', 'Israele', '+972', 9, 9),
  P('KZ', '🇰🇿', 'Kazakistan', '+7', 10, 10),
  P('KE', '🇰🇪', 'Kenya', '+254', 9, 9),
  P('KG', '🇰🇬', 'Kirghizistan', '+996', 9, 9),
  P('XK', '🇽🇰', 'Kosovo', '+383', 8, 9),
  P('KW', '🇰🇼', 'Kuwait', '+965', 8, 8),
  P('LV', '🇱🇻', 'Lettonia', '+371', 8, 8),
  P('LB', '🇱🇧', 'Libano', '+961', 7, 8),
  P('LY', '🇱🇾', 'Libia', '+218', 9, 9),
  P('LT', '🇱🇹', 'Lituania', '+370', 8, 8),
  P('LU', '🇱🇺', 'Lussemburgo', '+352', 9, 9),
  P('MK', '🇲🇰', 'Macedonia del Nord', '+389', 8, 8),
  P('MG', '🇲🇬', 'Madagascar', '+261', 9, 9),
  P('MY', '🇲🇾', 'Malaysia', '+60', 9, 10),
  P('ML', '🇲🇱', 'Mali', '+223', 8, 8),
  P('MT', '🇲🇹', 'Malta', '+356', 8, 8),
  P('MU', '🇲🇺', 'Mauritius', '+230', 8, 8),
  P('MX', '🇲🇽', 'Messico', '+52', 10, 10),
  P('MN', '🇲🇳', 'Mongolia', '+976', 8, 8),
  P('ME', '🇲🇪', 'Montenegro', '+382', 8, 8),
  P('MZ', '🇲🇿', 'Mozambico', '+258', 9, 9),
  P('MM', '🇲🇲', 'Myanmar', '+95', 8, 10),
  P('NP', '🇳🇵', 'Nepal', '+977', 10, 10),
  P('NI', '🇳🇮', 'Nicaragua', '+505', 8, 8),
  P('NE', '🇳🇪', 'Niger', '+227', 8, 8),
  P('NO', '🇳🇴', 'Norvegia', '+47', 8, 8),
  P('NZ', '🇳🇿', 'Nuova Zelanda', '+64', 8, 10),
  P('NL', '🇳🇱', 'Paesi Bassi', '+31', 9, 9),
  P('PA', '🇵🇦', 'Panama', '+507', 8, 8),
  P('PY', '🇵🇾', 'Paraguay', '+595', 9, 9),
  P('PT', '🇵🇹', 'Portogallo', '+351', 9, 9),
  P('QA', '🇶🇦', 'Qatar', '+974', 8, 8),
  P('GB', '🇬🇧', 'Regno Unito', '+44', 10, 10),
  P('CZ', '🇨🇿', 'Rep. Ceca', '+420', 9, 9),
  P('RS', '🇷🇸', 'Serbia', '+381', 8, 9),
  P('SG', '🇸🇬', 'Singapore', '+65', 8, 8),
  P('SY', '🇸🇾', 'Siria', '+963', 9, 9),
  P('SK', '🇸🇰', 'Slovacchia', '+421', 9, 9),
  P('SI', '🇸🇮', 'Slovenia', '+386', 8, 8),
  P('SO', '🇸🇴', 'Somalia', '+252', 7, 9),
  P('ES', '🇪🇸', 'Spagna', '+34', 9, 9),
  P('US', '🇺🇸', 'Stati Uniti', '+1', 10, 10),
  P('ZA', '🇿🇦', 'Sudafrica', '+27', 9, 9),
  P('SD', '🇸🇩', 'Sudan', '+249', 9, 9),
  P('SE', '🇸🇪', 'Svezia', '+46', 7, 10),
  P('CH', '🇨🇭', 'Svizzera', '+41', 9, 9),
  P('TW', '🇹🇼', 'Taiwan', '+886', 9, 9),
  P('TZ', '🇹🇿', 'Tanzania', '+255', 9, 9),
  P('TH', '🇹🇭', 'Thailandia', '+66', 9, 9),
  P('TG', '🇹🇬', 'Togo', '+228', 8, 8),
  P('TR', '🇹🇷', 'Turchia', '+90', 10, 10),
  P('HU', '🇭🇺', 'Ungheria', '+36', 9, 9),
  P('UY', '🇺🇾', 'Uruguay', '+598', 8, 8),
  P('UZ', '🇺🇿', 'Uzbekistan', '+998', 9, 9),
  P('VE', '🇻🇪', 'Venezuela', '+58', 10, 10),
  P('VN', '🇻🇳', 'Vietnam', '+84', 9, 10),
  P('ZM', '🇿🇲', 'Zambia', '+260', 9, 9),
  P('ZW', '🇿🇼', 'Zimbabwe', '+263', 9, 9),
];

export const PREFISSO_DEFAULT = PREFISSI[0];

export const trovaPrefisso = (iso) => PREFISSI.find((p) => p.iso === iso) || PREFISSO_DEFAULT;

/* La ricerca accetta il nome («franc», «Costa d'Avorio») o il numero
   («+33», «33»): sono i due modi in cui la gente cerca un prefisso. */
export function cercaPrefissi(query) {
  const q = query.trim().toLowerCase();
  if (!q) return PREFISSI;
  const soloCifre = q.replace(/[^0-9]/g, '');
  return PREFISSI.filter((p) => (
    p.nome.toLowerCase().includes(q)
    || (soloCifre && p.prefisso.slice(1).startsWith(soloCifre))
  ));
}

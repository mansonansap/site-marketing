// Small inline SVG illustrations. Brand symbols identify marketing channels;
// they do not imply certification or partnership.
const svg = body => `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
export const icons = {
 arrow:svg('<path d="M6 18 18 6M6 6h12v12"/>'),
 mail:svg('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/>'),
 growth:svg('<path d="M4 18h16M5 14l5-5 4 3 6-8M15 4h5v5"/>'),
 commerce:svg('<path d="M3 4h2l2.5 11h11L21 7H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>'),
 gaming:svg('<path d="M7 7h10c3 0 5 9 3 10-1.5 1-3-2-5-2H9c-2 0-3.5 3-5 2C2 16 4 7 7 7Z"/><path d="M7 10v4M5 12h4"/><circle cx="16" cy="11" r=".6" fill="currentColor"/><circle cx="18" cy="13" r=".6" fill="currentColor"/>'),
 seo:svg('<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5M8 12v-2m3 2V8m3 4V6"/>'),
 analytics:svg('<path d="M4 20h17M6 16v-4M12 16V5M18 16V9"/>'),
 facebook:'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14.1 22v-8.9h3l.45-3.5H14.1V7.4c0-1 .28-1.7 1.75-1.7h1.85V2.57A25 25 0 0 0 15 2.42c-2.7 0-4.55 1.65-4.55 4.68V9.6H7.4v3.5h3.05V22h3.65Z"/></svg>',
 instagram:svg('<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".7" fill="currentColor" stroke="none"/>'),
 ads:svg('<path d="m4 18 6-12a2 2 0 0 1 3.6 0l6 12M7 13h10"/><circle cx="4" cy="19" r="2" fill="currentColor" stroke="none"/>'),
 document:svg('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6M8 13h8M8 17h6"/>'),
 copy:svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>'),
 portrait:svg('<circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>'),
};

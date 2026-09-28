const wrap = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const SLOT_ICONS = {
  weapon: wrap('<path d="M20 3v3L9 17l-3-3L17 3z"/><path d="M5 13l6 6"/><path d="M3 21l3-3"/>'),
  helm: wrap('<path d="M5 14a7 7 0 0 1 14 0v5h-4v-4H9v4H5z"/><path d="M12 7v8"/>'),
  chest: wrap('<path d="M8 4l4 2 4-2 4 3-2 4v9H6v-9L4 7z"/><path d="M12 6v14"/>'),
  gloves: wrap('<path d="M7 21v-7l-2-3 1.5-1 2.5 2V6a1 1 0 0 1 2 0v5V5a1 1 0 0 1 2 0v6V6a1 1 0 0 1 2 0v6V8a1 1 0 0 1 2 0v7l-2 6z"/>'),
  boots: wrap('<path d="M8 3h5v11l6 3v4H6l1-4z"/><path d="M7 17h12"/>'),
  amulet: wrap('<path d="M5 3c0 6 3.5 9 7 10 3.5-1 7-4 7-10"/><path d="M12 13l-3 4 3 4 3-4z"/>'),
  ring: wrap('<circle cx="12" cy="15" r="6"/><path d="M10 7l2-3 2 3-2 2z"/>'),
};

export const SKILL_ICONS = {
  cleave: wrap('<path d="M4 16c3-8 10-11 16-11"/><path d="M4 20c5-6 11-8 16-8"/><path d="M16 3l4 2-2 4"/>'),
  bolt: wrap('<circle cx="15" cy="9" r="4"/><path d="M3 21l8-8"/><path d="M5 15l-2 2M9 19l-2 2"/>'),
  dash: wrap('<path d="M13 5l7 7-7 7"/><path d="M4 8h6M3 12h9M4 16h6"/>'),
  nova: wrap('<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M5 19l3-3M16 8l3-3"/>'),
  potion: wrap('<path d="M10 3h4M10 3v5l-4 6a5 5 0 0 0 4 7h4a5 5 0 0 0 4-7l-4-6V3"/><path d="M7 14h10"/>'),
};

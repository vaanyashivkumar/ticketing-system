/** Id + timestamp helpers. Kept out of domain (pure) — these are service-layer concerns. */
export const newId = (prefix = 'id'): string =>
  `${prefix}_${(crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)).replace(/-/g, '').slice(0, 12)}`;

export const nowIso = (): string => new Date().toISOString();

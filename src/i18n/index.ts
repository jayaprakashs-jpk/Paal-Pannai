import { useMemo } from 'react';
import { getSettings, useSettings } from '../store/settings';
import { TA } from './ta';

/**
 * Translation by English text. English is the key and the fallback, so a missing
 * Tamil string degrades to English instead of showing a blank/ID.
 * Run `npm run i18n:check` to list English strings that have no Tamil yet.
 * Placeholders: t('Sold {n} animals', { n: 3 })
 */
function fmt(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

export function translate(text: string, lang: 'en' | 'ta', vars?: Record<string, string | number>): string {
  const out = lang === 'ta' ? (TA[text] ?? text) : text;
  return fmt(out, vars);
}

/** Non-reactive version for services (notifications etc.). */
export function tNow(text: string, vars?: Record<string, string | number>): string {
  return translate(text, getSettings().lang, vars);
}

/** Hook: re-renders the screen when the language changes. */
export function useT() {
  const { lang } = useSettings();
  // Stable identity per language: screens put `t` in hook dependency lists.
  return useMemo(() => (text: string, vars?: Record<string, string | number>) => translate(text, lang, vars), [lang]);
}

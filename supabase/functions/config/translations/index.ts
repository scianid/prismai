// Bundled UI translations for the widget.
//
// Each language has a JSON file in this folder keyed by ISO 639-1 code.
// To add a new language: drop `xx.json` next to the existing files and
// register it in the `bundled` map below. New keys added to `en.json`
// automatically surface as the English fallback in every other
// language until that file is updated — see resolveTranslations().
//
// English is the fallback for every unknown code and for every missing
// key within a known language. The caller passes the canonical ISO
// code from `project.language_code`; name→code normalization lives in
// `supabase/functions/_shared/languageCodes.ts` and runs at write time.
//
// NOTE: most non-English files were machine-translated as a starting
// point for market expansion. The resolver's merge-over-English design
// keeps the widget safe (any broken key falls back to English), but
// native-speaker review is recommended before promoting the lesser-
// spoken languages to production.

import af from "./af.json" with { type: "json" };
import am from "./am.json" with { type: "json" };
import ar from "./ar.json" with { type: "json" };
import az from "./az.json" with { type: "json" };
import be from "./be.json" with { type: "json" };
import bg from "./bg.json" with { type: "json" };
import bn from "./bn.json" with { type: "json" };
import bs from "./bs.json" with { type: "json" };
import ca from "./ca.json" with { type: "json" };
import cs from "./cs.json" with { type: "json" };
import cy from "./cy.json" with { type: "json" };
import da from "./da.json" with { type: "json" };
import de from "./de.json" with { type: "json" };
import el from "./el.json" with { type: "json" };
import en from "./en.json" with { type: "json" };
import es from "./es.json" with { type: "json" };
import et from "./et.json" with { type: "json" };
import eu from "./eu.json" with { type: "json" };
import fa from "./fa.json" with { type: "json" };
import fi from "./fi.json" with { type: "json" };
import fr from "./fr.json" with { type: "json" };
import ga from "./ga.json" with { type: "json" };
import gl from "./gl.json" with { type: "json" };
import gu from "./gu.json" with { type: "json" };
import he from "./he.json" with { type: "json" };
import hi from "./hi.json" with { type: "json" };
import hr from "./hr.json" with { type: "json" };
import hu from "./hu.json" with { type: "json" };
import hy from "./hy.json" with { type: "json" };
import id from "./id.json" with { type: "json" };
import is from "./is.json" with { type: "json" };
import it from "./it.json" with { type: "json" };
import ja from "./ja.json" with { type: "json" };
import ka from "./ka.json" with { type: "json" };
import kk from "./kk.json" with { type: "json" };
import km from "./km.json" with { type: "json" };
import kn from "./kn.json" with { type: "json" };
import ko from "./ko.json" with { type: "json" };
import ku from "./ku.json" with { type: "json" };
import lt from "./lt.json" with { type: "json" };
import lv from "./lv.json" with { type: "json" };
import mk from "./mk.json" with { type: "json" };
import ml from "./ml.json" with { type: "json" };
import mn from "./mn.json" with { type: "json" };
import mr from "./mr.json" with { type: "json" };
import ms from "./ms.json" with { type: "json" };
import mt from "./mt.json" with { type: "json" };
import my from "./my.json" with { type: "json" };
import ne from "./ne.json" with { type: "json" };
import nl from "./nl.json" with { type: "json" };
import no from "./no.json" with { type: "json" };
import pa from "./pa.json" with { type: "json" };
import pl from "./pl.json" with { type: "json" };
import ps from "./ps.json" with { type: "json" };
import pt from "./pt.json" with { type: "json" };
import ro from "./ro.json" with { type: "json" };
import ru from "./ru.json" with { type: "json" };
import si from "./si.json" with { type: "json" };
import sk from "./sk.json" with { type: "json" };
import sl from "./sl.json" with { type: "json" };
import so from "./so.json" with { type: "json" };
import sq from "./sq.json" with { type: "json" };
import sr from "./sr.json" with { type: "json" };
import sv from "./sv.json" with { type: "json" };
import sw from "./sw.json" with { type: "json" };
import ta from "./ta.json" with { type: "json" };
import te from "./te.json" with { type: "json" };
import th from "./th.json" with { type: "json" };
import tl from "./tl.json" with { type: "json" };
import tr from "./tr.json" with { type: "json" };
import uk from "./uk.json" with { type: "json" };
import ur from "./ur.json" with { type: "json" };
import uz from "./uz.json" with { type: "json" };
import vi from "./vi.json" with { type: "json" };
import zh from "./zh.json" with { type: "json" };

export type Translations = Record<string, string>;

const bundled: Record<string, Translations> = {
  af,
  am,
  ar,
  az,
  be,
  bg,
  bn,
  bs,
  ca,
  cs,
  cy,
  da,
  de,
  el,
  en,
  es,
  et,
  eu,
  fa,
  fi,
  fr,
  ga,
  gl,
  gu,
  he,
  hi,
  hr,
  hu,
  hy,
  id,
  is,
  it,
  ja,
  ka,
  kk,
  km,
  kn,
  ko,
  ku,
  lt,
  lv,
  mk,
  ml,
  mn,
  mr,
  ms,
  mt,
  my,
  ne,
  nl,
  no,
  pa,
  pl,
  ps,
  pt,
  ro,
  ru,
  si,
  sk,
  sl,
  so,
  sq,
  sr,
  sv,
  sw,
  ta,
  te,
  th,
  tl,
  tr,
  uk,
  ur,
  uz,
  vi,
  zh,
};

/**
 * Return the full translation table for the given ISO 639-1 code, with
 * English filling in any key the target language doesn't define.
 *
 * - Matches the code case-insensitively (`"HE"` → `"he"`).
 * - NULL / unknown / empty codes resolve to English.
 * - The result is always a fresh object so callers can't mutate the bundle.
 */
export function resolveTranslations(code: string | null | undefined): Translations {
  const normalized = (code || "").trim().toLowerCase();
  const target = bundled[normalized];
  if (!target || normalized === "en") {
    return { ...en };
  }
  return { ...en, ...target };
}

/** Exposed for tests that want to assert on the raw bundled shape. */
export const _bundledForTest = bundled;

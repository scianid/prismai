/**
 * Server-side Art. 9 (special-category) data classifier.
 *
 * This is the legal backstop for the client-side regex layer in the widget
 * (which catches structured PII — credit cards, SSN, IBAN, email, phone,
 * GPS — but does NOT catch semantic content). This module catches *semantic*
 * disclosures: "I have HIV", "I'm Catholic", "I voted Republican", etc.
 *
 * Design choices:
 *   - **Phrase-pattern first**, not bare keyword match. "Christian Bale" must
 *     not trip `religion`; "I'm Christian" must. Patterns are anchored to
 *     first-person disclosure cues ("I am", "I have", "my", "I was diagnosed
 *     with") so demographic terms in non-disclosure contexts pass through.
 *   - **English-first.** The lexicon ships in English; `divee_widget` serves
 *     75 languages but the question textarea is capped at 200 chars and the
 *     bulk of leakage we observe is in English. Adding language packs is a
 *     mechanical extension — not a v1 priority. (See SPECIAL_CATEGORY_DATA_PLAN.md §3b.)
 *   - **Crude but defensible.** Recital-26 anonymization is not the goal here;
 *     this is the "reasonable measures" defense for Art. 9. False negatives
 *     are expected and acceptable for v1; false positives are visible to
 *     users (their text gets `[redacted]`) so we lean conservative.
 *   - **Bounded input.** Caller must clamp to ≤ 200 chars before calling.
 *     ReDoS protection at the call site, not here.
 */

export type Art9Category =
  | "race" //          racial or ethnic origin
  | "politics" //      political opinions
  | "religion" //      religious or philosophical beliefs
  | "union" //         trade union membership
  | "health" //        health
  | "sex" //           sex life or sexual orientation
  | "criminal"; //     criminal convictions and offences

export interface ClassifyResult {
  /** Input text with detected spans replaced by `marker`. */
  text: string;
  /** Categories that fired. Length = total detections; same category may
      appear multiple times if multiple spans hit. */
  hits: Art9Category[];
}

// ─── Patterns ──────────────────────────────────────────────────────────────
//
// Each entry: a compiled regex + the category it maps to. Patterns are case-
// insensitive and use `\b` word boundaries. They match the WHOLE phrase that
// constitutes the disclosure, not just the keyword — so we replace the entire
// span (e.g., "I'm Catholic" → "[redacted]" rather than "I'm [redacted]"),
// which is both clearer to the user and harder to triangulate post-redaction.

interface Pattern {
  re: RegExp;
  category: Art9Category;
}

// Common first-person openers. Defined once so categories share the construction.
const I_AM = /\bI(?:'m| am)\b/i.source;
const I_HAVE = /\bI(?:'ve| have| had|m living with| was diagnosed with| suffer from)\b/i.source;
const MY = /\bmy\b/i.source;

// Health: medical conditions in personal-disclosure context.
const HEALTH_CONDITIONS = [
  "HIV",
  "AIDS",
  "cancer",
  "diabetes",
  "depression",
  "anxiety disorder",
  "schizophrenia",
  "bipolar(?:\\s+disorder)?",
  "Alzheimer'?s",
  "Parkinson'?s",
  "epilepsy",
  "asthma",
  "lupus",
  "multiple sclerosis",
  "ADHD",
  "PTSD",
  "OCD",
  "autism",
  "dementia",
  "Crohn'?s",
  "celiac",
];
const HEALTH_RE = new RegExp(
  `(?:${I_HAVE}|${MY})\\s+(?:[a-z]+\\s+){0,2}(?:${HEALTH_CONDITIONS.join("|")})`,
  "i",
);
// Pregnancy is its own pattern — short phrasing, not "I have".
const PREGNANCY_RE = /\bI(?:'m| am) pregnant\b|\bmy pregnancy\b/i;

// Religion: self-identification only.
const RELIGIONS = [
  "Christian",
  "Catholic",
  "Protestant",
  "Evangelical",
  "Jewish",
  "Muslim",
  "Hindu",
  "Buddhist",
  "Sikh",
  "Mormon",
  "Atheist",
  "Agnostic",
  "Orthodox",
];
const RELIGION_RE = new RegExp(
  `(?:${I_AM})\\s+(?:an? |a practicing )?(?:${RELIGIONS.join("|")})\\b`,
  "i",
);

// Politics: explicit party / ideological self-identification.
const POLITICAL_IDENTITIES = [
  "Republican",
  "Democrat",
  "Conservative",
  "Liberal",
  "Socialist",
  "Communist",
  "Anarchist",
  "Libertarian",
  "Progressive",
];
const POLITICS_RE = new RegExp(
  `(?:${I_AM}\\s+(?:an? )?(?:${POLITICAL_IDENTITIES.join("|")})\\b|\\bI voted\\s+(?:for\\s+)?(?:${
    POLITICAL_IDENTITIES.join("|")
  })\\b)`,
  "i",
);

// Sex / orientation: self-identification.
const ORIENTATIONS = [
  "gay",
  "lesbian",
  "bisexual",
  "bi",
  "trans",
  "transgender",
  "queer",
  "asexual",
  "non-binary",
  "nonbinary",
  "homosexual",
  "pansexual",
];
const ORIENTATION_RE = new RegExp(
  `${I_AM}\\s+(?:${ORIENTATIONS.join("|")})\\b`,
  "i",
);

// Race / ethnicity: requires personal-disclosure context. Demographic terms
// in non-disclosure contexts ("Asian cuisine", "Black Friday") pass through.
const ETHNICITIES = [
  "Black",
  "White",
  "Asian",
  "Hispanic",
  "Latino",
  "Latina",
  "Latinx",
  "Caucasian",
  "African[- ]American",
  "Native American",
  "Indigenous",
  "Pacific Islander",
];
const RACE_RE = new RegExp(
  `${I_AM}\\s+(?:an? )?(?:${ETHNICITIES.join("|")})\\b`,
  "i",
);

// Trade union membership.
const UNION_RE =
  /\b(?:I(?:'m| am)\s+(?:an? |a member of\s+(?:an? |the\s+)?)?(?:union member|trade union(?:ist)?|labor union)|I (?:joined|am part of) (?:an? |the )?(?:union|trade union|labor union))\b/i;

// Criminal convictions / arrest records.
const CRIMINAL_RE =
  /\b(?:I (?:was|got|am|have been) (?:arrested|convicted|imprisoned|incarcerated|jailed|on parole|on probation)|my (?:criminal record|conviction|arrest record|parole|felony))\b/i;

const PATTERNS: Pattern[] = [
  { re: HEALTH_RE, category: "health" },
  { re: PREGNANCY_RE, category: "health" },
  { re: RELIGION_RE, category: "religion" },
  { re: POLITICS_RE, category: "politics" },
  { re: ORIENTATION_RE, category: "sex" },
  { re: RACE_RE, category: "race" },
  { re: UNION_RE, category: "union" },
  { re: CRIMINAL_RE, category: "criminal" },
];

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Classify and redact Art. 9 special-category disclosures in user-typed text.
 *
 * @param text   Sanitized input (caller must have already stripped HTML and
 *               clamped to ≤ 200 chars).
 * @param marker The string to substitute for matched spans. Defaults to
 *               `[redacted]`. The widget passes the localized translation key
 *               value (`[הוסר]` / `[entfernt]` / etc.) so server output
 *               matches client output for users whose language is set.
 * @returns `{ text, hits }`. `hits` is the list of categories that fired,
 *          one entry per detection (with duplicates if multiple spans hit
 *          the same category). Use it for telemetry.
 */
export function classifySensitive(
  text: string,
  marker: string = "[redacted]",
): ClassifyResult {
  if (typeof text !== "string" || text.length === 0) {
    return { text, hits: [] };
  }

  const hits: Art9Category[] = [];
  let result = text;

  // Run patterns sequentially with a global flag so we replace every span,
  // not just the first. We rebuild each regex with `gi` to avoid mutating the
  // shared module-level instances.
  for (const { re, category } of PATTERNS) {
    const globalRe = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let matched = false;
    result = result.replace(globalRe, () => {
      matched = true;
      hits.push(category);
      return marker;
    });
    // Hits per-category for the same pattern can repeat; the replace callback
    // above already pushes one hit per match. The `matched` flag is kept
    // only as an optimization signal — no behavior change.
    void matched;
  }

  return { text: result, hits };
}

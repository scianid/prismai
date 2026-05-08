# Shadow DOM Migration Plan — Divee Widget

## Goal

Move the production widget from light-DOM-with-prefixed-classes (`.divee-*`) into an open shadow root, so publisher CSS/JS can no longer bleed into widget UI. Lessons from the worldcup demo (`divee-worldcup/widget/src/widget.js`) confirm the approach works against hostile publisher CSS, but production has constraints the demo did not — most importantly, **Google Publisher Tag ads**.

## Today

- ~4,366 lines in [src/widget.js](../src/widget.js); ~71 KB CSS in [src/styles.css](../src/styles.css), inline-injected into `<head>`.
- All UI lives in light DOM under `.divee-widget`. Isolation relies on `all: initial` + class prefixes.
- 33 `document.querySelector*` / `document.getElementById` / `document.addEventListener` calls — most for widget-internal lookups, several for click-outside detection and visibility events.
- Display modes: `anchored`, `floating`, `sidebar`, `anchored+floating` (hybrid).
- GPT ad slots (`div-gpt-ad-1770993606680-0`, `…0534-0`) defined via `googletag.defineSlot(...)` — GPT requires `document.getElementById` to find these, so they **must stay in light DOM**.

## The hard constraint: ads stay in light DOM

GPT injects its creative iframes by calling `document.getElementById(slotDivId)`. If the slot div lives in a shadow root, GPT can't find it and the slot will go un-filled (silent revenue loss) or throw. Brand-safety vendors and viewability measurement (IAS, MOAT, etc.) make the same assumption.

Options:

1. **Two-mount architecture (recommended).** The widget script renders two siblings under the placeholder: a `<div data-divee-shadow>` that hosts the shadow root and contains all UI, and a `<div data-divee-ads>` that stays in light DOM and contains the ad slots. The widget JS owns both; the shadow-root UI uses absolute/relative positioning to align ads visually as if they were inside.
2. Keep ads inline-iframe'd manually (custom rendering). Rejected — gives up GPT's auction stack.
3. Use `<slot>` projection. Rejected — slotted content still lives in light DOM for styling purposes; doesn't actually help ads, just complicates layout.

We go with option 1.

## Migration phases

### Phase 1 — Shell only (no behavior change)

1. Create the shadow host inside the existing placeholder. Move the current `.divee-widget` root and all child UI into the shadow root.
2. Move [src/styles.css](../src/styles.css) injection from `<head>` into a `<style>` element inside the shadow root. Drop the inline-into-head injector.
3. Keep `data-divee-ads` mount in light DOM; render ad slot divs there.
4. Build the harness from the worldcup widget's `:host` block (font, color, transform, filter, animation, border, direction, etc. with `!important`) — but verified against the divee-widget vars and modes.

**Exit criteria:** widget renders identically on a clean publisher page; ads still serve; no console errors. No new behavior.

### Phase 2 — Internal query/listener audit

For each of the 33 `document.*` references in [src/widget.js](../src/widget.js):

- **Widget-internal lookup** (e.g., finding `.divee-message-input`): rewrite as `this.shadowRoot.querySelector(...)`. Most of the 33 fall here.
- **Page-global** (visibility, scroll, page-level keydown): leave on `document`/`window`.
- **Click-outside** ([widget.js:2689](../src/widget.js#L2689), [widget.js:3804-3811](../src/widget.js#L3804)): switch from `popup.contains(e.target)` to `e.composedPath().includes(popup)`. `e.target` is retargeted to the shadow host once the event leaves the boundary, so `.contains` will return false for any click inside the widget and incorrectly fire "outside".
- **Ad-related lookups** (`adElement?.closest('.divee-ad-slot-shared')` at [widget.js:2460](../src/widget.js#L2460)): these run inside light-DOM ad code — fine, but verify the ad code has its own document references that don't cross the boundary the wrong way.

### Phase 3 — Cross-boundary surfaces

Things that work differently or need code changes:

- **Focus tracking.** `document.activeElement` returns the host element from outside the shadow. Use `host.shadowRoot.activeElement` for inside-the-widget focus checks.
- **Selection / copy.** `window.getSelection()` does not return selections that started inside a shadow root. If we surface "copy answer" or similar features that depend on `Selection`, switch to `shadowRoot.getSelection()` (Chromium) with a fallback to range-based copy.
- **Forms.** `<form>` submit events bubble out as composed; `FormData` events do not cross. Audit any form usage.
- **CSS custom properties.** Page-level `:root { --foo }` inherits through the shadow boundary. Re-declare divee's vars on `:host` (and `.divee-root` as a second line of defense, mirroring what we did in worldcup) so a hostile/misconfigured page can't override `--divee-color-primary` etc.
- **Fonts.** `@font-face` declarations must be in the document or duplicated inside the shadow style. Decide once: keep our font files referenced from the document head (publisher-visible) or duplicate inside the shadow (private, but doubles bytes if the page also defines the same family). Recommendation: keep at document head — publishers already see them.
- **Tooltips / portals.** Anything that currently appends to `document.body` (autocomplete dropdowns, tag popups) needs to either move inside the shadow root, or stay in light DOM and be re-styled accordingly. Scan for `document.body.appendChild`.

### Phase 4 — Third-party integrations

- **Google Publisher Tag:** unchanged (lives in `data-divee-ads` light-DOM mount). Verify slot definitions still find their elements end-to-end.
- **Analytics / heatmaps (Hotjar, FullStory, etc.):** these will not see inside the shadow root. Document this. If publishers expect to record interactions, decide whether divee should expose its own event stream as a `CustomEvent` dispatched on the host (composed: true) so publisher analytics can attach.
- **Consent (TCF / IAB):** consent reads from `window.__tcfapi` — unaffected.
- **Browser extensions / accessibility tools:** open shadow DOM is enumerable, so screen readers and dev tools work. Closed shadow would break a11y — keep `mode: 'open'`.

### Phase 5 — Rollout

1. Ship behind a server-side flag in the widget config (`features.shadowDom`). Default off.
2. Enable on internal test publishers, run the worldcup hostile-CSS test against the divee-widget mounted on a synthetic hostile page.
3. Enable on a small low-revenue publisher; compare ad fill rate and viewability against pre-rollout baseline (this is what catches the "did we accidentally break GPT" class of regressions).
4. Ramp.

## Risks ranked

1. **Ad regressions.** Highest impact, hardest to detect (silent revenue drop). Mitigation: two-mount architecture + per-publisher rollout with fill-rate monitoring.
2. **Click-outside bugs.** Easy to miss in QA — the widget feels "stuck open" only on certain interactions. Mitigation: grep for every `.contains(e.target)` and convert. Add a Playwright test per popup.
3. **Page-CSS-var pollution.** Hostile or merely-busy publishers redefining common var names (`--primary`, `--text`) could re-style the widget through inheritance. Mitigation: namespace our vars (`--divee-*`, already done) and pin them on `:host`.
4. **Hostile inheritance bombs (font, color, direction).** Same fixes as worldcup — `!important` on `:host` for inheritable text properties.
5. **Tooltip/portal layout.** Medium — visible during QA, easy to fix once found.
6. **Third-party analytics opacity.** Low priority for migration itself; handle as a separate decision about what events to expose.

## Open questions to resolve before Phase 1

- Do we want `mode: 'open'` (matches worldcup, supports a11y, allows publisher debugging) or `mode: 'closed'` (slightly stronger isolation, breaks a11y tools)? Recommendation: open.
- Where exactly should the ad mount sit relative to the shadow host — sibling, parent, or absolutely positioned over a placeholder rect inside the shadow? Affects layout in `floating` and `sidebar` modes.
- Should we keep the legacy light-DOM path behind the flag for one full release cycle as a rollback, or delete it once we ramp to 100%?

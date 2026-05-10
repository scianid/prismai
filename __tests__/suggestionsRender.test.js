/**
 * Suggestions render regression tests.
 *
 * Background: when ?diveeVideoAd=true is set, the widget calls
 * prefetchSuggestions() while the video ad plays. That populates
 * state.suggestions but NEVER renders the buttons to the DOM. After the ad
 * ends, teardownVideoAd() focuses the input which calls onTextAreaFocus().
 * The cached branch (state.suggestions.length > 0) used to just open the
 * popup without rendering — so users saw an empty popup. These tests pin
 * down the contract that the cached branch renders any missing buttons,
 * so this regression cannot return silently.
 */

const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');
const fs = require('fs');

const widgetJs = fs.readFileSync('./src/widget.js', 'utf8');

// The closed-state suggestion teaser bubble is gated by a per-project
// experimental flag (`animatedSuggestionsOnClosed`). The bubble test suite
// below opts in by setting it to true on the widget's serverConfig — see
// `makeAnchoredWidget`.
const describeBubble = describe;

function makeWidget({ experimental } = {}) {
    delete window.__diveeWidgetLoaded;
    eval(widgetJs); // eslint-disable-line no-eval
    const widget = new DiveeWidget({ projectId: 'test-project' }); // eslint-disable-line no-undef
    widget.state.serverConfig = {
        show_ad: false,
        ad_tag_id: null,
        client_name: 'Test',
        icon_url: '',
        experimental: experimental || {}
    };
    widget.createWidget();
    // askQuestion would start a real fetch / streaming flow — stub it for tests.
    widget.askQuestion = jest.fn();
    return widget;
}

describe('renderSuggestionsList()', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    test('renders one button per suggestion (string shape)', () => {
        const widget = makeWidget();
        widget.renderSuggestionsList(['What is X?', 'How does Y work?']);
        const buttons = widget.elements.expandedView.querySelectorAll('.divee-suggestions-list .divee-suggestion');
        expect(buttons.length).toBe(2);
        expect(buttons[0].textContent).toBe('What is X?');
        expect(buttons[1].textContent).toBe('How does Y work?');
    });

    test('renders question text and data-id from {question, id} shape', () => {
        const widget = makeWidget();
        widget.renderSuggestionsList([
            { id: 'q1', question: 'Why do birds fly?' },
            { id: 'q2', question: 'How fast?' }
        ]);
        const buttons = widget.elements.expandedView.querySelectorAll('.divee-suggestions-list .divee-suggestion');
        expect(buttons.length).toBe(2);
        expect(buttons[0].textContent).toBe('Why do birds fly?');
        expect(buttons[0].getAttribute('data-id')).toBe('q1');
        expect(buttons[1].getAttribute('data-id')).toBe('q2');
    });

    test('clicking a rendered suggestion calls askQuestion with the question and id', () => {
        const widget = makeWidget();
        widget.renderSuggestionsList([{ id: 'q1', question: 'Why?' }]);
        const button = widget.elements.expandedView.querySelector('.divee-suggestions-list .divee-suggestion');
        button.click();
        expect(widget.askQuestion).toHaveBeenCalledWith('Why?', 'suggestion', 'q1');
    });

    test('replaces previous content (no duplicates on re-render)', () => {
        const widget = makeWidget();
        widget.renderSuggestionsList(['A', 'B']);
        widget.renderSuggestionsList(['C']);
        const buttons = widget.elements.expandedView.querySelectorAll('.divee-suggestions-list .divee-suggestion');
        expect(buttons.length).toBe(1);
        expect(buttons[0].textContent).toBe('C');
    });
});

describe('onTextAreaFocus() cached-suggestions path (video-ad prefetch regression)', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    test('renders buttons when state.suggestions is populated but list DOM is empty', async () => {
        const widget = makeWidget();
        // Simulate prefetchSuggestions having populated state silently while
        // the video ad played — DOM list is still empty.
        widget.state.suggestions = ['Cached A', 'Cached B', 'Cached C'];
        const list = widget.elements.expandedView.querySelector('.divee-suggestions-list');
        expect(list.children.length).toBe(0);

        await widget.onTextAreaFocus();

        const buttons = list.querySelectorAll('.divee-suggestion');
        expect(buttons.length).toBe(3);
        expect(buttons[0].textContent).toBe('Cached A');
        expect(buttons[2].textContent).toBe('Cached C');
    });

    test('opens the suggestions popup (display + is-open) on the cached path', async () => {
        const widget = makeWidget();
        widget.state.suggestions = ['x'];
        const container = widget.elements.expandedView.querySelector('.divee-suggestions-input');

        await widget.onTextAreaFocus();

        expect(container.classList.contains('is-open')).toBe(true);
        expect(container.style.display).toBe('block');
    });

    test('does not duplicate buttons when called again with the same cached suggestions', async () => {
        const widget = makeWidget();
        widget.state.suggestions = ['only one'];

        await widget.onTextAreaFocus();
        // Second focus while already open should not stack a second copy.
        await widget.onTextAreaFocus();

        const buttons = widget.elements.expandedView.querySelectorAll('.divee-suggestions-list .divee-suggestion');
        expect(buttons.length).toBe(1);
    });

    test('skips entirely in knowledgebase mode', async () => {
        const widget = makeWidget();
        widget.config.widgetMode = 'knowledgebase';
        widget.state.suggestions = ['should-not-render'];

        await widget.onTextAreaFocus();

        const buttons = widget.elements.expandedView.querySelectorAll('.divee-suggestions-list .divee-suggestion');
        expect(buttons.length).toBe(0);
    });
});

describeBubble('collapsed-state suggestion bubble', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        try { sessionStorage.clear(); } catch (_) { /* noop */ }
        jest.useRealTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
        try { sessionStorage.clear(); } catch (_) { /* noop */ }
    });

    function makeAnchoredWidget(opts = {}) {
        // Opt into the closed-state carousel experimental flag at construction
        // time so createWidget() pre-reserves the bubble slot. The widget's
        // hard-coded default is `false`; production projects flip it on via
        // serverConfig.experimental.animatedSuggestionsOnClosed.
        const widget = makeWidget({ experimental: { animatedSuggestionsOnClosed: true } });
        // makeWidget defaulted to anchored. Mutate displayMode if a test needs another mode.
        if (opts.displayMode) widget.config.displayMode = opts.displayMode;
        if (opts.widgetMode) widget.config.widgetMode = opts.widgetMode;
        // Stub network-touching methods so primeCollapsedBubble runs offline.
        // Tests that need a cache hit pre-populate widget.state.suggestions
        // before calling primeCollapsedBubble (the GET-only helper short-
        // circuits when state already has suggestions).
        widget.prefetchSuggestions = jest.fn(async () => { /* not used in closed flow */ });
        widget.fetchCachedSuggestions = jest.fn(async () => null); // default: cache miss
        return widget;
    }

    test('pre-reserves an empty bubble slot at mount to prevent CLS', () => {
        const widget = makeAnchoredWidget();
        // The bubble container is rendered immediately so chips arriving
        // after the suggestions fetch fill an existing slot instead of
        // pushing the page down. The slot is empty until primed.
        expect(widget.elements.collapsedBubble).toBeTruthy();
        const bubble = widget.elements.collapsedView.querySelector('.divee-collapsed-bubble');
        expect(bubble).not.toBeNull();
        expect(bubble.querySelectorAll('.divee-collapsed-bubble-chip').length).toBe(0);
    });

    test('renders bubble carousel above the input pill, with one chip per suggestion', async () => {
        const widget = makeAnchoredWidget();
        widget.state.suggestions = ['First?', 'Second?', 'Third?'];

        await widget.primeCollapsedBubble();

        const bubble = widget.elements.collapsedBubble;
        expect(bubble).toBeTruthy();
        expect(bubble.classList.contains('divee-collapsed-bubble')).toBe(true);

        const collapsed = widget.elements.collapsedView;
        const search = collapsed.querySelector('.divee-search-container-collapsed');
        const children = Array.from(collapsed.children);
        expect(children.indexOf(bubble)).toBeLessThan(children.indexOf(search));

        const track = bubble.querySelector('.divee-collapsed-bubble-track');
        expect(track).toBeTruthy();
        const chips = track.querySelectorAll('.divee-collapsed-bubble-chip');
        expect(chips.length).toBe(3);
        expect(chips[0].dataset.questionText).toBe('First?');
        expect(chips[1].dataset.questionText).toBe('Second?');
        expect(chips[2].dataset.questionText).toBe('Third?');
        expect(chips[0].querySelector('.divee-collapsed-bubble-chip-text').textContent).toBe('First?');
    });

    test('experimental flag gates the bubble: false → no render even when everything else passes', () => {
        const widget = makeAnchoredWidget();
        // Disable the per-project experimental override.
        widget.state.serverConfig.experimental = { animatedSuggestionsOnClosed: false };
        expect(widget.shouldRenderCollapsedBubble()).toBe(false);
        // Re-enable: gate passes (other gates also pass for an anchored article widget).
        widget.state.serverConfig.experimental = { animatedSuggestionsOnClosed: true };
        expect(widget.shouldRenderCollapsedBubble()).toBe(true);
        // Unset key falls back to the hard-coded default (false).
        widget.state.serverConfig.experimental = {};
        expect(widget.shouldRenderCollapsedBubble()).toBe(false);
    });

    test('shouldRenderCollapsedBubble returns false in cubic/sidebar/floating/knowledgebase/suppression', () => {
        const widget = makeAnchoredWidget();
        widget.config.displayMode = 'cubic';
        expect(widget.shouldRenderCollapsedBubble()).toBe(false);
        widget.config.displayMode = 'sidebar';
        expect(widget.shouldRenderCollapsedBubble()).toBe(false);
        widget.config.displayMode = 'floating';
        expect(widget.shouldRenderCollapsedBubble()).toBe(false);
        widget.config.displayMode = 'anchored';
        widget.config.widgetMode = 'knowledgebase';
        expect(widget.shouldRenderCollapsedBubble()).toBe(false);
        widget.config.widgetMode = 'article';
        widget.state.suggestionsSuppressed = true;
        expect(widget.shouldRenderCollapsedBubble()).toBe(false);
        widget.state.suggestionsSuppressed = false;
        expect(widget.shouldRenderCollapsedBubble()).toBe(true);
        widget.config.displayMode = 'anchored+floating';
        expect(widget.shouldRenderCollapsedBubble()).toBe(true);
    });

    test('primeCollapsedBubble renders first suggestion text', async () => {
        const widget = makeAnchoredWidget();
        widget.state.suggestions = ['What is X?', 'How does Y work?'];

        await widget.primeCollapsedBubble();

        const firstChip = widget.elements.collapsedBubble.querySelector('.divee-collapsed-bubble-chip');
        expect(firstChip.dataset.questionText).toBe('What is X?');
        expect(firstChip.querySelector('.divee-collapsed-bubble-chip-text').textContent).toBe('What is X?');
    });

    test('advanceCollapsedBubble recycles the first chip to the end after the slide', async () => {
        const widget = makeAnchoredWidget();
        widget.state.suggestions = [
            { id: 'q1', question: 'A?' },
            { id: 'q2', question: 'B?' },
            { id: 'q3', question: 'C?' }
        ];
        await widget.primeCollapsedBubble();
        const track = widget.elements.collapsedBubble.querySelector('.divee-collapsed-bubble-track');

        // jsdom returns offsetWidth: 0 by default; stub a sensible width on chips.
        Array.from(track.children).forEach(c => Object.defineProperty(c, 'offsetWidth', { configurable: true, value: 120 }));

        jest.useFakeTimers();
        widget.advanceCollapsedBubble();
        // After the 270ms recycle window, the first chip moves to the end.
        jest.advanceTimersByTime(270);

        const chips = track.querySelectorAll('.divee-collapsed-bubble-chip');
        expect(chips[0].dataset.questionText).toBe('B?');
        expect(chips[1].dataset.questionText).toBe('C?');
        expect(chips[2].dataset.questionText).toBe('A?');
    });

    test('paused cycle does not recycle chips', async () => {
        const widget = makeAnchoredWidget();
        widget.state.suggestions = ['A?', 'B?'];
        await widget.primeCollapsedBubble();
        const track = widget.elements.collapsedBubble.querySelector('.divee-collapsed-bubble-track');
        Array.from(track.children).forEach(c => Object.defineProperty(c, 'offsetWidth', { configurable: true, value: 120 }));

        widget.state.collapsedBubbleCycle.paused = true;
        widget.advanceCollapsedBubble();

        const firstChip = track.querySelector('.divee-collapsed-bubble-chip');
        expect(firstChip.dataset.questionText).toBe('A?');
    });

    test('mouseenter pauses, mouseleave resumes', async () => {
        const widget = makeAnchoredWidget();
        widget.state.suggestions = ['A?', 'B?'];
        await widget.primeCollapsedBubble();

        widget.elements.collapsedBubble.dispatchEvent(new Event('mouseenter'));
        expect(widget.state.collapsedBubbleCycle.paused).toBe(true);

        widget.elements.collapsedBubble.dispatchEvent(new Event('mouseleave'));
        expect(widget.state.collapsedBubbleCycle.paused).toBe(false);
    });

    test('clicking a chip invokes askQuestion with suggestion-closed source after expand', async () => {
        const widget = makeAnchoredWidget();
        widget.state.suggestions = [
            { id: 'q1', question: 'First?' },
            { id: 'q2', question: 'Second?' }
        ];
        await widget.primeCollapsedBubble();
        widget.expand = jest.fn();

        jest.useFakeTimers();
        const chips = widget.elements.collapsedBubble.querySelectorAll('.divee-collapsed-bubble-chip');
        chips[1].click();

        expect(widget.expand).toHaveBeenCalledWith({ skipAutoFocus: true, trigger: 'collapsed_bubble' });
        expect(widget.askQuestion).not.toHaveBeenCalled();

        jest.advanceTimersByTime(200);

        expect(widget.askQuestion).toHaveBeenCalledWith('Second?', 'suggestion-closed', 'q2');
    });

    test('clicking a chip does not also fire the parent collapsedView click (no double expand)', async () => {
        const widget = makeAnchoredWidget();
        widget.state.suggestions = ['A?'];
        await widget.primeCollapsedBubble();
        widget.expand = jest.fn();

        const chip = widget.elements.collapsedBubble.querySelector('.divee-collapsed-bubble-chip');
        chip.click();

        expect(widget.expand).toHaveBeenCalledTimes(1);
    });

    test('cache miss falls back to generic carousel (no POST fired)', async () => {
        const widget = makeAnchoredWidget();
        widget.state.suggestions = [];
        // Spy on the POST path to confirm it is never called from the closed state.
        widget.fetchSuggestions = jest.fn(async () => []);
        widget.prefetchSuggestions = jest.fn(async () => { /* should never be called either */ });

        await widget.primeCollapsedBubble();

        const bubble = widget.elements.collapsedView.querySelector('.divee-collapsed-bubble');
        expect(bubble).not.toBeNull();
        const chips = bubble.querySelectorAll('.divee-collapsed-bubble-chip');
        expect(chips.length).toBeGreaterThan(0);
        // Generic chips are flagged with data-generic="true".
        chips.forEach(c => expect(c.dataset.generic).toBe('true'));
        // Critically: no AI-generation POST may have fired.
        expect(widget.fetchSuggestions).not.toHaveBeenCalled();
        expect(widget.prefetchSuggestions).not.toHaveBeenCalled();
    });

    test('clicking a generic chip uses the suggestion-generic source', async () => {
        const widget = makeAnchoredWidget();
        widget.state.suggestions = [];
        await widget.primeCollapsedBubble();
        widget.expand = jest.fn();

        jest.useFakeTimers();
        const firstChip = widget.elements.collapsedBubble.querySelector('.divee-collapsed-bubble-chip');
        const text = firstChip.dataset.questionText;
        firstChip.click();

        jest.advanceTimersByTime(200);
        expect(widget.askQuestion).toHaveBeenCalledWith(text, 'suggestion-generic', null);
    });

    test('cache hit renders AI suggestions, not generic fallback', async () => {
        const widget = makeAnchoredWidget();
        widget.state.suggestions = [
            { id: 'q1', question: 'Real AI question 1?' },
            { id: 'q2', question: 'Real AI question 2?' }
        ];

        await widget.primeCollapsedBubble();

        const chips = widget.elements.collapsedBubble.querySelectorAll('.divee-collapsed-bubble-chip');
        expect(chips.length).toBe(2);
        chips.forEach(c => expect(c.dataset.generic).toBeUndefined());
        expect(chips[0].dataset.questionText).toBe('Real AI question 1?');
    });

    test('suppressSuggestions removes the bubble', async () => {
        const widget = makeAnchoredWidget();
        widget.state.suggestions = ['A?'];
        await widget.primeCollapsedBubble();
        expect(widget.elements.collapsedBubble).toBeTruthy();

        widget.suppressSuggestions();

        expect(widget.elements.collapsedBubble).toBeNull();
        expect(widget.elements.collapsedView.querySelector('.divee-collapsed-bubble')).toBeNull();
        expect(widget.state.suggestionsSuppressed).toBe(true);
    });

    test('stopCollapsedBubbleCycle clears the interval and swap timeout', async () => {
        const widget = makeAnchoredWidget();
        widget.state.suggestions = ['A?', 'B?'];
        await widget.primeCollapsedBubble();
        const cycle = widget.state.collapsedBubbleCycle;
        expect(cycle.intervalId).not.toBeNull();

        widget.stopCollapsedBubbleCycle();

        expect(cycle.intervalId).toBeNull();
        expect(cycle.swapTimeoutId).toBeNull();
    });
});

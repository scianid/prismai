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

function makeWidget() {
    delete window.__diveeWidgetLoaded;
    eval(widgetJs); // eslint-disable-line no-eval
    const widget = new DiveeWidget({ projectId: 'test-project' }); // eslint-disable-line no-undef
    widget.state.serverConfig = { show_ad: false, ad_tag_id: null, client_name: 'Test', icon_url: '' };
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
        const buttons = document.querySelectorAll('.divee-suggestions-list .divee-suggestion');
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
        const buttons = document.querySelectorAll('.divee-suggestions-list .divee-suggestion');
        expect(buttons.length).toBe(2);
        expect(buttons[0].textContent).toBe('Why do birds fly?');
        expect(buttons[0].getAttribute('data-id')).toBe('q1');
        expect(buttons[1].getAttribute('data-id')).toBe('q2');
    });

    test('clicking a rendered suggestion calls askQuestion with the question and id', () => {
        const widget = makeWidget();
        widget.renderSuggestionsList([{ id: 'q1', question: 'Why?' }]);
        const button = document.querySelector('.divee-suggestions-list .divee-suggestion');
        button.click();
        expect(widget.askQuestion).toHaveBeenCalledWith('Why?', 'suggestion', 'q1');
    });

    test('replaces previous content (no duplicates on re-render)', () => {
        const widget = makeWidget();
        widget.renderSuggestionsList(['A', 'B']);
        widget.renderSuggestionsList(['C']);
        const buttons = document.querySelectorAll('.divee-suggestions-list .divee-suggestion');
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

        const buttons = document.querySelectorAll('.divee-suggestions-list .divee-suggestion');
        expect(buttons.length).toBe(1);
    });

    test('skips entirely in knowledgebase mode', async () => {
        const widget = makeWidget();
        widget.config.widgetMode = 'knowledgebase';
        widget.state.suggestions = ['should-not-render'];

        await widget.onTextAreaFocus();

        const buttons = document.querySelectorAll('.divee-suggestions-list .divee-suggestion');
        expect(buttons.length).toBe(0);
    });
});

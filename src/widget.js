/**
 * Divee Article Assistant Widget
 * Embeddable AI chat widget for articles
 * 
 * Requires: content.js (for getContent, getContentTitle, getContentUrl functions)
 * These functions should be loaded before this widget or available globally.
 */

(function () {
    'use strict';

    class DiveeWidget {
        constructor(config) {
            this.config = {
                projectId: config.projectId,
                articleId: config.articleId || null,
                position: config.position || 'bottom',
                maxHeight: config.maxHeight || 600,
                autoExpand: config.autoExpand || false,
                apiBaseUrl: config.apiBaseUrl || 'http://localhost:3000/api/v1',
                articleClass: config.articleClass || null
            };

            this.state = {
                isExpanded: false,
                isStreaming: false,
                suggestions: [],
                messages: [],
                serverConfig: null
            };

            this.elements = {};
            
            // Cache for article content (extracted once)
            this.contentCache = {
                content: null,
                title: null,
                url: null,
                extracted: false
            };
            
            this.init();
        }

        async init() {
            console.log('[Divee] Initializing widget...', this.config);

            // Load server configuration
            await this.loadServerConfig();

            // Extract article content
            this.extractArticleContent();

            // Create widget DOM
            this.createWidget();

            // Attach event listeners
            this.attachEventListeners();

            // Track analytics
            this.trackEvent('widget_loaded', {
                project_id: this.config.projectId,
                article_id: this.config.articleId,
                position: this.config.position
            });
        }

        async loadServerConfig() {
            try {
                const serverConfig = await this.fetchServerConfig({
                    client_id: this.config.projectId,
                    title: this.contentCache.title || this.articleTitle,
                    url: this.contentCache.url || this.articleUrl,
                    article_content: this.contentCache.content || this.articleContent
                });

                this.state.serverConfig = serverConfig;
                console.log('[Divee] Server config loaded:', this.state.serverConfig);

                // Apply direction and language
                if (serverConfig.direction) {
                    this.elements.container?.setAttribute('dir', serverConfig.direction);
                }
                if (serverConfig.language) {
                    this.elements.container?.setAttribute('lang', serverConfig.language);
                }
            } catch (error) {
                console.error('[Divee] Failed to load config:', error);
                // Fallback to default config
                this.state.serverConfig = this.getDefaultConfig();
            }
        }

        async fetchServerConfig(payload) {
            if (!this.config.apiBaseUrl) {
                throw new Error('Missing apiBaseUrl');
            }

            const response = await fetch(`${this.config.apiBaseUrl}/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Config request failed: ${response.status}`);
            }

            return response.json();
        }

        getDefaultConfig() {
            return {
                direction: 'ltr',
                language: 'en',
                icon_url: 'https://images.icon-icons.com/167/PNG/512/cnn_23166.png',
                client_name: 'Demo Site',
                client_description: 'Article Assistant',
                highlight_color: ['#68E5FD', '#A389E0'],
                show_ad: true,
                input_text_placeholders: [
                    'Ask anything about this article...'
                ]
            };
        }

        extractArticleContent() {
            // Check if content is already cached
            if (this.contentCache.extracted) {
                console.log('[Divee] Using cached content');
                this.articleTitle = this.contentCache.title;
                this.articleContent = this.contentCache.content;
                return;
            }

            // Extract content using functions from content.js
            try {
                // Use getContentTitle() if available
                if (typeof getContentTitle === 'function') {
                    this.articleTitle = getContentTitle();
                } else {
                    this.articleTitle = document.title || document.querySelector('h1')?.textContent || 'Untitled Article';
                }

                // Use getContent() if available
                if (typeof getContent === 'function') {
                    this.articleContent = getContent(this.config.articleClass);
                } else {
                    // Fallback to simple extraction
                    const article = document.querySelector('article') ||
                        document.querySelector('[role="article"]') ||
                        document.querySelector('main');
                    this.articleContent = article ? article.textContent.trim() : document.body.textContent.trim();
                }

                // Use getContentUrl() if available
                if (typeof getContentUrl === 'function') {
                    this.articleUrl = getContentUrl();
                } else {
                    this.articleUrl = window.location.href;
                }

                // Cache the extracted content
                this.contentCache = {
                    content: this.articleContent,
                    title: this.articleTitle,
                    url: this.articleUrl,
                    extracted: true
                };

                console.log('[Divee] Article extracted and cached:', {
                    title: this.articleTitle,
                    url: this.articleUrl,
                    contentLength: this.articleContent.length
                });
            } catch (error) {
                console.error('[Divee] Error extracting content:', error);
                // Fallback to basic extraction
                this.articleTitle = document.title || 'Untitled Article';
                this.articleContent = document.body.textContent.trim();
                this.articleUrl = window.location.href;
            }
        }

        createWidget() {
            // Create container
            const container = document.createElement('div');
            container.className = 'divee-widget';
            container.setAttribute('data-state', 'collapsed');

            // Apply direction from config
            const config = this.state.serverConfig || this.getDefaultConfig();
            if (config.direction) {
                container.setAttribute('dir', config.direction);
            }

            // Create collapsed view
            const collapsedView = this.createCollapsedView();
            container.appendChild(collapsedView);

            // Create expanded view (hidden initially)
            const expandedView = this.createExpandedView();
            expandedView.style.display = 'none';
            container.appendChild(expandedView);

            // Store references
            this.elements.container = container;
            this.elements.collapsedView = collapsedView;
            this.elements.expandedView = expandedView;

            // Insert into page
            this.insertWidget(container);
        }

        createCollapsedView() {
            const view = document.createElement('div');
            view.className = 'divee-collapsed';

            const config = this.state.serverConfig || this.getDefaultConfig();
            const showAd = config.show_ad ? '' : 'style="display: none;"';

            view.innerHTML = `
                <div class="divee-powered-by-collapsed">
                    <a class="divee-powered-by" href="https://www.divee.ai" target="_blank" rel="noopener noreferrer">powered by divee.ai</a>
                </div>
                <div class="divee-search-container-collapsed">
                    <img class="divee-icon-site-collapsed" src="https://emvwmwdsaakdnweyhmki.supabase.co/storage/v1/object/public/public-files/newslatch/ai.png" alt="AI icon" />
                    <img class="divee-icon-site-collapsed" src="${config.icon_url}" alt="Site icon" />
                    <input type="text" class="divee-search-input-collapsed" placeholder="" readonly />
                    <svg class="divee-send-icon-collapsed" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        </div>
                <div class="divee-ad-slot" ${showAd}>
                    <div class="divee-ad-placeholder">
            [Advertisement Space]<br>
            <small>Sponsored Content</small>
          </div>
        </div>
      `;

            // Add typewriter effect
            setTimeout(() => {
                const input = view.querySelector('.divee-search-input-collapsed');
                if (input && config.input_text_placeholders) {
                    this.typewriterEffect(input, config.input_text_placeholders);
                }
            }, 500);

            return view;
        }

        typewriterEffect(input, phrases) {
            if (!input || !phrases || phrases.length === 0) return;

            let phraseIndex = 0;
            let charIndex = 0;
            const typeSpeed = 50;
            const deleteSpeed = 30;
            const pauseAfterType = 2000;
            const pauseAfterDelete = 500;

            const type = () => {
                const currentPhrase = String(phrases[phraseIndex] || '');
                if (charIndex < currentPhrase.length) {
                    input.placeholder = currentPhrase.substring(0, charIndex + 1);
                    charIndex++;
                    setTimeout(type, typeSpeed + Math.random() * 30);
                } else {
                    setTimeout(erase, pauseAfterType);
                }
            };

            const erase = () => {
                const currentPhrase = String(phrases[phraseIndex] || '');
                if (charIndex > 0) {
                    input.placeholder = currentPhrase.substring(0, charIndex - 1);
                    charIndex--;
                    setTimeout(erase, deleteSpeed);
                } else {
                    // Move to next phrase
                    phraseIndex = (phraseIndex + 1) % phrases.length;
                    setTimeout(type, pauseAfterDelete);
                }
            };

            // Start typing
            type();
        }

        createEmptyState(config) {
            const container = document.createElement('div');
            container.className = 'divee-empty-state';
            
            const placeholders = config.input_text_placeholders || ['Ask anything about this article...'];
            // Use the first one as primary, or all of them.
            // Let's show the first one as a prompt.
            const text = placeholders.length > 0 ? placeholders[0] : 'Ask me anything about this article';

            container.innerHTML = `
                <div class="divee-empty-icon">
                    <img src="${config.icon_url}" alt="AI" />
                </div>
                <div class="divee-empty-text">
                    ${text}
                </div>
            `;
            return container;
        }

        createExpandedView() {
            const view = document.createElement('div');
            view.className = 'divee-expanded';

            const config = this.state.serverConfig || this.getDefaultConfig();
            const placeholder = (config.input_text_placeholders && config.input_text_placeholders.length > 0) 
                ? config.input_text_placeholders[0] 
                : 'Ask anything about this article...';

            view.innerHTML = `
                <div class="divee-header">
                    <div class="divee-header-top">
                        <div class="divee-icons">
                            <img class="divee-icon-site-collapsed" src="https://emvwmwdsaakdnweyhmki.supabase.co/storage/v1/object/public/public-files/newslatch/ai.png" alt="AI icon" />
                            <img class="divee-icon-site" src="${config.icon_url}" alt="Site icon" />
                        </div>
                        <span class="divee-title">${config.client_name}</span>
                        <button class="divee-close" aria-label="Close">✕</button>
                    </div>
                </div>
                <div class="divee-powered-by-wrapper">
                    <a class="divee-powered-by" href="https://www.divee.ai" target="_blank" rel="noopener noreferrer">powered by divee.ai</a>
                </div>
                <div class="divee-content">
                    <div class="divee-suggestions" style="display: none;">
                        <button class="divee-suggestions-toggle" type="button" aria-expanded="false">Suggested questions</button>
                        <div class="divee-suggestions-list"></div>
          </div>
                    <div class="divee-chat">
                        <div class="divee-messages"></div>
          </div>
                    <div class="divee-input-container">
                        <div class="divee-suggestions-input" style="display: none;">
                            <div class="divee-suggestions-list"></div>
                        </div>
            <textarea 
                            class="divee-input" 
              placeholder="${placeholder}"
              rows="1"
              maxlength="200"
            ></textarea>
                        <button class="divee-send" aria-label="Send">
              <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            </button>
                        <div class="divee-input-footer">
                            <div class="divee-warning">This is an AI driven tool, results might not always be accurate</div>
                            <div class="divee-counter">0/200</div>
            </div>
          </div>
        </div>
      `;

            // Add typewriter effect
            setTimeout(() => {
                const input = view.querySelector('.divee-input');
                if (input && config.input_text_placeholders) {
                    this.typewriterEffect(input, config.input_text_placeholders);
                }
            }, 500);

            // Add empty state if no messages
            const messagesContainer = view.querySelector('.divee-messages');
            if (this.state.messages.length === 0) {
                 const emptyState = this.createEmptyState(config);
                 messagesContainer.appendChild(emptyState);
            }

            return view;
        }

        insertWidget(container) {
            // Insert at the end of the article
            const article = document.querySelector('article') ||
                document.querySelector('[role="article"]') ||
                document.querySelector('main');

            if (article) {
                article.appendChild(container);
            } else {
                // Fallback: append to body if no article found
                document.body.appendChild(container);
            }
        }

        attachEventListeners() {
            // Click anywhere on collapsed view to expand
            this.elements.collapsedView.addEventListener('click', () => this.expand());

            // Close button
            const closeButton = this.elements.expandedView.querySelector('.divee-close');
            closeButton.addEventListener('click', (e) => {
                e.stopPropagation();
                this.collapse();
            });

            // Text area focus
            const textarea = this.elements.expandedView.querySelector('.divee-input');
            textarea.addEventListener('focus', () => this.onTextAreaFocus());
            textarea.addEventListener('click', () => this.onTextAreaFocus()); // Also open on click
            textarea.addEventListener('input', (e) => {
                this.autoResizeTextarea(e.target);
                this.updateCharacterCounter(e.target);
            });

            // Close suggestions on click outside
            document.addEventListener('click', (e) => {
                const suggestionsInput = this.elements.expandedView.querySelector('.divee-suggestions-input');
                const inputContainer = this.elements.expandedView.querySelector('.divee-input-container');
                
                if (suggestionsInput && 
                    suggestionsInput.classList.contains('is-open') && 
                    !inputContainer.contains(e.target)) {
                    suggestionsInput.classList.remove('is-open');
                }
            });

            // Send button
            const sendButton = this.elements.expandedView.querySelector('.divee-send');
            sendButton.addEventListener('click', () => this.sendQuestion());

            // Enter key to send
            textarea.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendQuestion();
                }
            });
        }

        expand() {
            this.state.isExpanded = true;
            this.elements.container.setAttribute('data-state', 'expanded');

            // Show expanded view and trigger animation
            this.elements.expandedView.style.display = 'block';
            this.elements.expandedView.style.opacity = '0';
            this.elements.expandedView.style.transform = 'translateY(10px)';

            // Fade out collapsed view
            this.elements.collapsedView.style.opacity = '0';

            setTimeout(() => {
                this.elements.collapsedView.style.display = 'none';
                this.elements.expandedView.style.opacity = '1';
                this.elements.expandedView.style.transform = 'translateY(0)';
            }, 150);

            this.trackEvent('widget_expanded', { trigger: 'click' });

            // Focus on input after animation
            setTimeout(() => {
                this.elements.expandedView.querySelector('.divee-input').focus();
            }, 300);
        }

        collapse() {
            this.state.isExpanded = false;
            this.elements.container.setAttribute('data-state', 'collapsed');

            // Fade out expanded view
            this.elements.expandedView.style.opacity = '0';
            this.elements.expandedView.style.transform = 'translateY(10px)';

            setTimeout(() => {
                this.elements.expandedView.style.display = 'none';
                this.elements.collapsedView.style.display = 'block';
                this.elements.collapsedView.style.opacity = '0';

                setTimeout(() => {
                    this.elements.collapsedView.style.opacity = '1';
                }, 50);
            }, 200);

            this.trackEvent('widget_collapsed', {
                time_spent: Date.now(),
                questions_asked: this.state.messages.filter(m => m.role === 'user').length
            });
        }

        async onTextAreaFocus() {
            const suggestionsContainer = this.elements.expandedView.querySelector('.divee-suggestions-input');
            
            // If we already have suggestions, just show them
            if (this.state.suggestions.length > 0) {
                if (suggestionsContainer && !suggestionsContainer.classList.contains('is-open')) {
                    suggestionsContainer.style.display = 'block';
                    suggestionsContainer.classList.add('is-open');
                    this.trackEvent('suggestions_reopened', { count: this.state.suggestions.length });
                }
                return;
            }

            this.trackEvent('textarea_focused', { timestamp: Date.now() });

            const suggestionsList = suggestionsContainer?.querySelector('.divee-suggestions-list');

            // Show shimmer loading state
            if (suggestionsContainer && suggestionsList) {
                suggestionsContainer.style.display = 'block';
                suggestionsContainer.classList.add('is-open');
                suggestionsList.innerHTML = `
        <div class="divee-suggestion divee-loading-item"><div class="divee-shimmer-line"></div></div>
        <div class="divee-suggestion divee-loading-item"><div class="divee-shimmer-line"></div></div>
        <div class="divee-suggestion divee-loading-item"><div class="divee-shimmer-line"></div></div>
      `;
            }

            try {
                const suggestions = await this.fetchSuggestions();
                this.state.suggestions = suggestions;

                // Fade out shimmer first
                // No complex fade needed, just swap content as structure matches
                if (!suggestionsList) return;
                suggestionsList.innerHTML = '';
                    
                // Add suggestions with animation
                suggestions.forEach((item, idx) => {
                        const questionText = typeof item === 'string' ? item : item.question;
                        const questionId = typeof item === 'string' ? null : item.id;
                        const button = document.createElement('button');
                        button.className = 'divee-suggestion';
                        button.setAttribute('data-index', idx);
                        if (questionId) button.setAttribute('data-id', questionId);
                        button.textContent = questionText;
                        button.addEventListener('click', (e) => {
                            const question = e.target.textContent;
                            const id = e.target.getAttribute('data-id');
                            this.askQuestion(question, 'suggestion', id);
                        });
                        suggestionsList.appendChild(button);
                    });

                this.trackEvent('suggestions_fetched', {
                    article_id: this.config.articleId,
                    suggestions_count: suggestions.length,
                    load_time: 0
                });
            } catch (error) {
                console.error('[Divee] Failed to fetch suggestions:', error);
                if (suggestionsList) {
                    suggestionsList.innerHTML = '<div class="divee-error">Could not load suggestions</div>';
                }
            }
        }

        async fetchSuggestions() {
            // Send cached content to server for suggestions
            const payload = {
                projectId: this.config.projectId,
                articleId: this.config.articleId,
                title: this.contentCache.title,
                url: this.contentCache.url,
                content: this.contentCache.content
            };

            try {
                const response = await fetch(`${this.config.apiBaseUrl}/suggestions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    throw new Error(`Suggestions request failed: ${response.status}`);
                }

                const data = await response.json();
                if (Array.isArray(data?.suggestions)) {
                    return data.suggestions;
                }
            } catch (error) {
                console.error('[Divee] Suggestions request failed:', error);
            }

            return [];
        }

        sendQuestion() {
            const textarea = this.elements.expandedView.querySelector('.divee-input');
            const question = textarea.value.trim();

            if (!question) return;

            this.askQuestion(question, 'custom', null);
            textarea.value = '';
            textarea.style.height = 'auto';

            // Reset counter
            const counter = this.elements.expandedView.querySelector('.divee-counter');
            if (counter) {
                counter.textContent = '0/200';
            }
        }

        async askQuestion(question, type, questionId) {
            // Close suggestions overlay so user can see the chat
            const suggestionsContainer = this.elements.expandedView.querySelector('.divee-suggestions-input');
            if (suggestionsContainer) {
                suggestionsContainer.classList.remove('is-open');
            }

            // Add user message
            this.addMessage('user', question);

            this.trackEvent('question_asked', { type, question, question_id: questionId });

            // Start streaming response
            this.state.isStreaming = true;
            const messageId = this.addMessage('ai', '', true);

            try {
                await this.streamResponse(question, messageId, questionId);
            } catch (error) {
                console.error('[Divee] Failed to get answer:', error);
                this.updateMessage(messageId, 'Sorry, I encountered an error. Please try again.');
            } finally {
                this.state.isStreaming = false;
            }
        }

        addMessage(role, content, streaming = false) {
            const messagesContainer = this.elements.expandedView.querySelector('.divee-messages');
            
            // Remove empty state
            const emptyState = messagesContainer.querySelector('.divee-empty-state');
            if (emptyState) emptyState.remove();

            const chatContainer = this.elements.expandedView.querySelector('.divee-chat');
            const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            const messageDiv = document.createElement('div');
            messageDiv.className = `divee-message divee-message-${role}`;
            messageDiv.setAttribute('data-message-id', messageId);

            const label = document.createElement('div');
            label.className = 'divee-message-label';
            if (role === 'user') {
                label.textContent = 'You';
            } else {
                const config = this.state.serverConfig || this.getDefaultConfig();
                label.innerHTML = `<img class="divee-message-icon" src="${config.icon_url}" alt="AI" />`;
            }

            const contentDiv = document.createElement('div');
            contentDiv.className = 'divee-message-content';
            contentDiv.textContent = content;

            if (streaming) {
                const cursor = document.createElement('span');
                cursor.className = 'divee-cursor';
                cursor.textContent = '▊';
                contentDiv.appendChild(cursor);
            }

            messageDiv.appendChild(label);
            messageDiv.appendChild(contentDiv);
            messagesContainer.appendChild(messageDiv);

            // Scroll to bottom of chat container
            chatContainer.scrollTop = chatContainer.scrollHeight;

            this.state.messages.push({ id: messageId, role, content });

            return messageId;
        }

        updateMessage(messageId, content, append = false) {
            const messageDiv = this.elements.expandedView.querySelector(`[data-message-id="${messageId}"]`);
            if (!messageDiv) return;

            const contentDiv = messageDiv.querySelector('.divee-message-content');
            const cursor = contentDiv.querySelector('.divee-cursor');

            if (append) {
                const textNode = document.createTextNode(content);
                if (cursor) {
                    contentDiv.insertBefore(textNode, cursor);
                } else {
                    contentDiv.appendChild(textNode);
                }
            } else {
                if (cursor) cursor.remove();
                contentDiv.textContent = content;
            }

            // Scroll to bottom of chat container
            const chatContainer = this.elements.expandedView.querySelector('.divee-chat');
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }

        async simulateStreaming(messageId, text) {
            const chunkSize = 4;
            for (let i = 0; i < text.length; i += chunkSize) {
                const chunk = text.slice(i, i + chunkSize);
                this.updateMessage(messageId, chunk, true);
                await new Promise(resolve => setTimeout(resolve, 15));
            }
        }

        async streamResponse(question, messageId, questionId) {
            const payload = {
                projectId: this.config.projectId,
                questionId: questionId || `q-${Date.now()}`,
                question: question,
                title: this.contentCache.title,
                url: this.contentCache.url,
                content: this.contentCache.content
            };

            const response = await fetch(`${this.config.apiBaseUrl}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                if (response.status === 403) {
                    this.updateMessage(messageId, 'Free form questions are currently not supported.');
                    const messageDiv = this.elements.expandedView.querySelector(`[data-message-id="${messageId}"]`);
                    const cursor = messageDiv?.querySelector('.divee-cursor');
                    if (cursor) cursor.remove();
                    return;
                }
                throw new Error(`Chat request failed: ${response.status}`);
            }

            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                const data = await response.json();
                if (data?.answer) {
                    await this.simulateStreaming(messageId, data.answer);
                }
            } else if (response.body) {
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';

                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });

                    const parts = buffer.split('\n\n');
                    buffer = parts.pop() || '';

                    for (const part of parts) {
                        const lines = part.split('\n');
                        for (const line of lines) {
                            const trimmed = line.trim();
                            if (!trimmed.startsWith('data:')) continue;
                            const data = trimmed.replace(/^data:\s*/, '');
                            if (data === '[DONE]') continue;
                            try {
                                const json = JSON.parse(data);
                                const delta = json?.choices?.[0]?.delta?.content;
                                if (delta) this.updateMessage(messageId, delta, true);
                            } catch {
                                // ignore parse errors
                            }
                        }
                    }
                }
            }

            const messageDiv = this.elements.expandedView.querySelector(`[data-message-id="${messageId}"]`);
            const cursor = messageDiv?.querySelector('.divee-cursor');
            if (cursor) cursor.remove();
        }

        autoResizeTextarea(textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
        }

        updateCharacterCounter(textarea) {
            const counter = this.elements.expandedView.querySelector('.divee-counter');
            if (counter) {
                const length = textarea.value.length;
                counter.textContent = `${length}/200`;
            }
        }

        trackEvent(eventName, data) {
            console.log('[Divee Analytics]', eventName, data);
            // TODO: Send to analytics endpoint
        }
    }

    // Auto-initialize from script tag
    function autoInit() {
        const scripts = document.querySelectorAll('script[data-project-id]');
        scripts.forEach(script => {
            const config = {
                projectId: script.getAttribute('data-project-id'),
                position: script.getAttribute('data-position') || 'bottom',
                apiBaseUrl: "https://vdbmhqlogqrxozaibntq.supabase.co/functions/v1",
                articleClass: script.getAttribute('data-article-class')
            };

            new DiveeWidget(config);
        });
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoInit);
    } else {
        autoInit();
    }

    // Expose for manual initialization
    window.DiveeWidget = DiveeWidget;

})();

/**
 * PrismAI Article Assistant Widget
 * Embeddable AI chat widget for articles
 * 
 * Requires: content.js (for getContent, getContentTitle, getContentUrl functions)
 * These functions should be loaded before this widget or available globally.
 */

(function () {
    'use strict';

    class PrismAIWidget {
        constructor(config) {
            this.config = {
                projectId: config.projectId,
                articleId: config.articleId,
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
                serverConfig: null,
                suggestedArticles: [
                    {
                        image: 'https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=300&h=200&fit=crop',
                        title: '10 Ways to Boost Article Engagement',
                        description: 'Learn proven strategies to keep readers on your site longer and increase interaction rates.',
                        url: '#'
                    },
                    {
                        image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=300&h=200&fit=crop',
                        title: 'The Future of Digital Publishing',
                        description: 'Explore emerging trends and technologies shaping the future of online content.',
                        url: '#'
                    },
                    {
                        image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=300&h=200&fit=crop',
                        title: 'Understanding Reader Analytics',
                        description: 'Deep dive into metrics that matter for content creators and publishers.',
                        url: '#'
                    }
                ]
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
            console.log('[PrismAI] Initializing widget...', this.config);

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
                // Mock server config API call
                // In production, this would be: fetch(`${this.config.apiBaseUrl}/config`, {...})
                const mockResponse = await this.fetchMockServerConfig({
                    client_id: this.config.projectId,
                    title: this.contentCache.title || this.articleTitle,
                    url: this.contentCache.url || this.articleUrl,
                    article_content: this.contentCache.content || this.articleContent
                });

                this.state.serverConfig = mockResponse;
                console.log('[PrismAI] Server config loaded:', this.state.serverConfig);

                // Apply direction and language
                if (mockResponse.direction) {
                    this.elements.container?.setAttribute('dir', mockResponse.direction);
                }
                if (mockResponse.language) {
                    this.elements.container?.setAttribute('lang', mockResponse.language);
                }
            } catch (error) {
                console.error('[PrismAI] Failed to load config:', error);
                // Fallback to default config
                this.state.serverConfig = this.getDefaultConfig();
            }
        }

        async fetchMockServerConfig(payload) {
            // Log the payload being sent (includes cached content)
            console.log('[PrismAI] Sending to server:', {
                client_id: payload.client_id,
                title: payload.title,
                url: this.contentCache.url || this.articleUrl,
                content_length: payload.article_content?.length || 0
            });
            
            // Simulate API delay
            await new Promise(resolve => setTimeout(resolve, 300));

            const hebConfig = {
                direction: 'rtl',
                language: 'he',
                icon_url: 'https://images.icon-icons.com/167/PNG/512/cnn_23166.png',
                client_name: 'וואלה חדשות',
                client_description: 'ערוץ החדשות המוביל בישראל',
                highlight_color: ['#68E5FD', '#A389E0'],
                show_ad: true,
                input_text_placeholders: [
                    "סכם לי את המאמר בנקודות עיקריות",
                    "אני יכול לעזור לך עם המאמר הזה!",
                    "שאל אותי כל דבר על התוכן הזה...",
                    "מה תרצה לדעת?",
                ]
            }

            const enConfig = {
                direction: 'ltr',
                language: 'en',
                icon_url: 'https://images.icon-icons.com/167/PNG/512/cnn_23166.png',
                client_name: 'TechNews Daily',
                client_description: 'Your source for technology insights',
                highlight_color: ['#68E5FD', '#A389E0'],
                show_ad: true,
                input_text_placeholders: [
                    'Let me help you with this article!',
                    'Ask me anything about this content...',
                    'What would you like to know?',
                    'I can explain, summarize, or answer questions...',
                    'Click to start our conversation!',
                    'Curious about something? Just ask!'
                ]
            }

            // Mock server response
            return hebConfig;
            return enConfig
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
                console.log('[PrismAI] Using cached content');
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

                console.log('[PrismAI] Article extracted and cached:', {
                    title: this.articleTitle,
                    url: this.articleUrl,
                    contentLength: this.articleContent.length
                });
            } catch (error) {
                console.error('[PrismAI] Error extracting content:', error);
                // Fallback to basic extraction
                this.articleTitle = document.title || 'Untitled Article';
                this.articleContent = document.body.textContent.trim();
                this.articleUrl = window.location.href;
            }
        }

        createWidget() {
            // Create container
            const container = document.createElement('div');
            container.className = 'prismai-widget';
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
            view.className = 'prismai-collapsed';

            const config = this.state.serverConfig || this.getDefaultConfig();
            const showAd = config.show_ad ? '' : 'style="display: none;"';

            view.innerHTML = `
        <div class="prismai-search-container-collapsed">
          <img class="prismai-icon-site-collapsed" src="https://emvwmwdsaakdnweyhmki.supabase.co/storage/v1/object/public/public-files/newslatch/ai.png" alt="AI icon" />
          <img class="prismai-icon-site-collapsed" src="${config.icon_url}" alt="Site icon" />
          <input type="text" class="prismai-search-input-collapsed" placeholder="" readonly />
          <svg class="prismai-send-icon-collapsed" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        </div>
        <div class="prismai-ad-slot" ${showAd}>
          <div class="prismai-ad-placeholder">
            [Advertisement Space]<br>
            <small>Sponsored Content</small>
          </div>
        </div>
      `;

            // Add typewriter effect
            setTimeout(() => {
                const input = view.querySelector('.prismai-search-input-collapsed');
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

        createExpandedView() {
            const view = document.createElement('div');
            view.className = 'prismai-expanded';

            const config = this.state.serverConfig || this.getDefaultConfig();

            view.innerHTML = `
        <div class="prismai-header">
          <div class="prismai-icons">
            <img class="prismai-icon-site-collapsed" src="https://emvwmwdsaakdnweyhmki.supabase.co/storage/v1/object/public/public-files/newslatch/ai.png" alt="AI icon" />
            <img class="prismai-icon-site" src="${config.icon_url}" alt="Site icon" />
          </div>
          <span class="prismai-title">${config.client_name}</span>
          <button class="prismai-close" aria-label="Close">✕</button>
        </div>
        <div class="prismai-content">
          <div class="prismai-suggestions" style="display: none;">
            <div class="prismai-suggestions-title">Suggested Questions:</div>
            <div class="prismai-suggestions-list"></div>
          </div>
          <div class="prismai-chat" style="display: none;">
            <div class="prismai-messages"></div>
          </div>
          <div class="prismai-input-container">
            <textarea 
              class="prismai-input" 
              placeholder="Ask anything about this article..."
              rows="1"
              maxlength="200"
            ></textarea>
            <button class="prismai-send" aria-label="Send">
              <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            </button>
            <div class="prismai-input-footer">
              <div class="prismai-warning">This is an AI driven tool, results might not always be accurate.</div>
              <div class="prismai-counter">0/200</div>
            </div>
          </div>
          <div class="prismai-suggested-reads">
            <div class="prismai-reads-title">Suggested Reads:</div>
            <div class="prismai-reads-list">
              ${this.state.suggestedArticles.map(article => `
                <a href="${article.url}" class="prismai-article-card">
                  <img src="${article.image}" alt="${article.title}" class="prismai-article-image" />
                  <div class="prismai-article-content">
                    <div class="prismai-article-title">${article.title}</div>
                    <div class="prismai-article-description">${article.description}</div>
                  </div>
                </a>
              `).join('')}
            </div>
          </div>
        </div>
      `;
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
            const closeButton = this.elements.expandedView.querySelector('.prismai-close');
            closeButton.addEventListener('click', (e) => {
                e.stopPropagation();
                this.collapse();
            });

            // Text area focus
            const textarea = this.elements.expandedView.querySelector('.prismai-input');
            textarea.addEventListener('focus', () => this.onTextAreaFocus());
            textarea.addEventListener('input', (e) => {
                this.autoResizeTextarea(e.target);
                this.updateCharacterCounter(e.target);
            });

            // Send button
            const sendButton = this.elements.expandedView.querySelector('.prismai-send');
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
                this.elements.expandedView.querySelector('.prismai-input').focus();
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
            // Only fetch suggestions once
            if (this.state.suggestions.length > 0) return;

            this.trackEvent('textarea_focused', { timestamp: Date.now() });

            const suggestionsContainer = this.elements.expandedView.querySelector('.prismai-suggestions');
            const suggestionsList = this.elements.expandedView.querySelector('.prismai-suggestions-list');

            // Show shimmer loading state
            suggestionsContainer.style.display = 'block';
            suggestionsList.innerHTML = `
        <div class="prismai-shimmer-line"></div>
        <div class="prismai-shimmer-line"></div>
        <div class="prismai-shimmer-line"></div>
      `;

            try {
                const suggestions = await this.fetchSuggestions();
                this.state.suggestions = suggestions;

                // Fade out shimmer first
                const shimmerLines = suggestionsList.querySelectorAll('.prismai-shimmer-line');
                shimmerLines.forEach(line => {
                    line.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                    line.style.opacity = '0';
                    line.style.transform = 'translateX(-30px)';
                });

                // Wait for shimmer to fade out, then show suggestions
                setTimeout(() => {
                    suggestionsList.innerHTML = '';

                    // Add suggestions with animation
                    suggestions.forEach((q, idx) => {
                        const button = document.createElement('button');
                        button.className = 'prismai-suggestion';
                        button.setAttribute('data-index', idx);
                        button.textContent = q;
                        button.addEventListener('click', (e) => {
                            const question = e.target.textContent;
                            this.askQuestion(question, 'suggestion');
                        });
                        suggestionsList.appendChild(button);
                    });
                }, 300);

                this.trackEvent('suggestions_fetched', {
                    article_id: this.config.articleId,
                    suggestions_count: suggestions.length,
                    load_time: 0
                });
            } catch (error) {
                console.error('[PrismAI] Failed to fetch suggestions:', error);
                suggestionsList.innerHTML = '<div class="prismai-error">Could not load suggestions</div>';
            }
        }

        async fetchSuggestions() {
            // Send cached content to server for suggestions
            const payload = {
                project_id: this.config.projectId,
                article_id: this.config.articleId,
                title: this.contentCache.title,
                url: this.contentCache.url,
                content: this.contentCache.content
            };
            
            console.log('[PrismAI] Fetching suggestions with cached content:', {
                title: payload.title,
                url: payload.url,
                content_length: payload.content?.length || 0
            });
            
            // Mock API call with 0.5 second delay
            // In production: const response = await fetch(`${this.config.apiBaseUrl}/suggestions`, { method: 'POST', body: JSON.stringify(payload) });
            return new Promise((resolve) => {
                setTimeout(() => {
                    resolve([
                        'Summarize this article in 3 key points',
                        'What are the main arguments presented?',
                        'What are the practical implications?'
                    ]);
                }, 500);
            });
        }

        sendQuestion() {
            const textarea = this.elements.expandedView.querySelector('.prismai-input');
            const question = textarea.value.trim();

            if (!question) return;

            this.askQuestion(question, 'custom');
            textarea.value = '';
            textarea.style.height = 'auto';

            // Reset counter
            const counter = this.elements.expandedView.querySelector('.prismai-counter');
            if (counter) {
                counter.textContent = '0/200';
            }
        }

        async askQuestion(question, type) {
            // Hide suggestions after selecting one
            const suggestionsContainer = this.elements.expandedView.querySelector('.prismai-suggestions');
            if (suggestionsContainer) {
                suggestionsContainer.style.opacity = '0';
                suggestionsContainer.style.transform = 'translateY(-10px)';
                setTimeout(() => {
                    suggestionsContainer.style.display = 'none';
                }, 300);
            }

            // Show chat container if first message
            const chatContainer = this.elements.expandedView.querySelector('.prismai-chat');
            if (chatContainer.style.display === 'none') {
                chatContainer.style.display = 'block';
                chatContainer.style.opacity = '0';
                chatContainer.style.maxHeight = '0';
                chatContainer.style.overflow = 'hidden';

                // Animate unfold
                setTimeout(() => {
                    chatContainer.style.opacity = '1';
                    chatContainer.style.maxHeight = '400px';
                }, 50);
            }

            // Add user message
            this.addMessage('user', question);

            this.trackEvent('question_asked', { type, question });

            // Start streaming response
            this.state.isStreaming = true;
            const messageId = this.addMessage('ai', '', true);

            try {
                await this.streamResponse(question, messageId);
            } catch (error) {
                console.error('[PrismAI] Failed to get answer:', error);
                this.updateMessage(messageId, 'Sorry, I encountered an error. Please try again.');
            } finally {
                this.state.isStreaming = false;
            }
        }

        addMessage(role, content, streaming = false) {
            const messagesContainer = this.elements.expandedView.querySelector('.prismai-messages');
            const chatContainer = this.elements.expandedView.querySelector('.prismai-chat');
            const messageId = `msg-${Date.now()}`;

            const messageDiv = document.createElement('div');
            messageDiv.className = `prismai-message prismai-message-${role}`;
            messageDiv.setAttribute('data-message-id', messageId);

            const label = document.createElement('div');
            label.className = 'prismai-message-label';
            label.textContent = role === 'user' ? 'You' : 'AI';

            const contentDiv = document.createElement('div');
            contentDiv.className = 'prismai-message-content';
            contentDiv.textContent = content;

            if (streaming) {
                const cursor = document.createElement('span');
                cursor.className = 'prismai-cursor';
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

            const contentDiv = messageDiv.querySelector('.prismai-message-content');
            const cursor = contentDiv.querySelector('.prismai-cursor');

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
            const chatContainer = this.elements.expandedView.querySelector('.prismai-chat');
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }

        async streamResponse(question, messageId) {
            // Send question with cached content to server
            const payload = {
                project_id: this.config.projectId,
                article_id: this.config.articleId,
                question: question,
                title: this.contentCache.title,
                url: this.contentCache.url,
                content: this.contentCache.content
            };
            
            console.log('[PrismAI] Sending question with cached content:', {
                question,
                title: payload.title,
                url: payload.url,
                content_length: payload.content?.length || 0
            });
            
            // In production: const response = await fetch(`${this.config.apiBaseUrl}/chat`, { method: 'POST', body: JSON.stringify(payload) });
            // Mock streaming response
            const response = `Here are the key insights about "${question}":\n1. This is a detailed explanation based on the article content.\n2. The information is extracted from the context you provided.\n3. Citations would appear here linking back to specific paragraphs.`;

            // Simulate streaming character by character
            for (let i = 0; i < response.length; i++) {
                await new Promise(resolve => setTimeout(resolve, 20));
                this.updateMessage(messageId, response[i], true);
            }

            // Remove cursor
            const messageDiv = this.elements.expandedView.querySelector(`[data-message-id="${messageId}"]`);
            const cursor = messageDiv?.querySelector('.prismai-cursor');
            if (cursor) cursor.remove();
        }

        autoResizeTextarea(textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
        }

        updateCharacterCounter(textarea) {
            const counter = this.elements.expandedView.querySelector('.prismai-counter');
            if (counter) {
                const length = textarea.value.length;
                counter.textContent = `${length}/200`;
            }
        }

        trackEvent(eventName, data) {
            console.log('[PrismAI Analytics]', eventName, data);
            // TODO: Send to analytics endpoint
        }
    }

    // Auto-initialize from script tag
    function autoInit() {
        const scripts = document.querySelectorAll('script[data-project-id]');
        scripts.forEach(script => {
            const config = {
                projectId: script.getAttribute('data-project-id'),
                articleId: script.getAttribute('data-article-id') || 'auto-' + Date.now(),
                position: script.getAttribute('data-position') || 'bottom',
                apiBaseUrl: script.getAttribute('data-api-url'),
                articleClass: script.getAttribute('data-article-class')
            };

            new PrismAIWidget(config);
        });
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoInit);
    } else {
        autoInit();
    }

    // Expose for manual initialization
    window.PrismAIWidget = PrismAIWidget;

})();

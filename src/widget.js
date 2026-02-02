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
                cachedBaseUrl: config.cachedBaseUrl || 'https://cdn.divee.ai/functions/v1',
                nonCacheBaseUrl: config.nonCacheBaseUrl || 'https://srv.divee.ai/functions/v1',
                // These will be populated from server config
                displayMode: 'anchored',
                floatingPosition: 'bottom-right',
                anchoredPosition: 'bottom',
                articleClass: null,
                containerSelector: null
            };

            this.state = {
                isExpanded: false,
                isStreaming: false,
                suggestions: [],
                messages: [],
                serverConfig: null,
                conversationId: null,
                aiResponseCount: 0,
                suggestionsSuppressed: false,
                lastAdRefresh: 0,              // Timestamp of last ad refresh
                expandedAdsDisplayed: false,   // Track if expanded ads have been displayed
                widgetVisibleTracked: false    // Track if widget_visible event has been fired
            };

            // Analytics batching
            this.analyticsQueue = [];
            this.analyticsFlushTimer = null;
            this.analyticsConfig = {
                maxBatchSize: 10,      // Flush when queue reaches this size
                flushInterval: 3000,   // Flush after 3 seconds of inactivity
                immediateEvents: ['widget_loaded', 'impression', 'widget_visible'] // Events to send immediately
            };

            this.elements = {};

            // Cache for article content (extracted once)
            this.contentCache = {
                content: null,
                title: null,
                url: null,
                image_url: null,
                og_image: null,
                extracted: false
            };

            // Check if suggestions are suppressed for this session
            this.checkSuggestionsSuppression();

            this.init();
        }

        isDebugMode() {
            const urlParams = new URLSearchParams(window.location.search);
            return urlParams.get('diveeDebug') === 'true';
        }

        checkSuggestionsSuppression() {
            const key = `divee_suggestions_suppressed_${window.location.href}`;
            this.state.suggestionsSuppressed = sessionStorage.getItem(key) === 'true';
        }

        suppressSuggestions() {
            const key = `divee_suggestions_suppressed_${window.location.href}`;
            sessionStorage.setItem(key, 'true');
            this.state.suggestionsSuppressed = true;
        }

        log(...args) {
            if (this.isDebugMode()) {
                console.log(...args);
            }
        }

        generateUUID() {
            if (typeof crypto !== 'undefined' && crypto.randomUUID) {
                return crypto.randomUUID();
            }
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
                var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        }

        getAnalyticsIds() {
            // Visitor ID (Persistent)
            let visitorId = localStorage.getItem('divee_visitor_id');
            if (!visitorId) {
                visitorId = this.generateUUID();
                localStorage.setItem('divee_visitor_id', visitorId);
            }

            // Session ID (Per Session)
            let sessionId = sessionStorage.getItem('divee_session_id');
            if (!sessionId) {
                sessionId = this.generateUUID();
                sessionStorage.setItem('divee_session_id', sessionId);
            }

            this.state.visitorId = visitorId;
            this.state.sessionId = sessionId;

            // Conversation ID (per article, persists in sessionStorage)
            const conversationKey = `divee_conversation_${window.location.href}`;
            let conversationId = sessionStorage.getItem(conversationKey);
            if (conversationId) {
                this.state.conversationId = conversationId;
            }

            return { visitorId, sessionId };
        }

        initGoogleAds() {
            this.log('[Divee DEBUG] initGoogleAds called');
            this.log('[Divee DEBUG] window.googletag exists:', !!window.googletag);
            
            if (window.googletag && window.googletag._initialized_by_divee) {
                this.log('[Divee DEBUG] Google Ads already initialized by Divee, skipping');
                return;
            }

            this.log('[Divee DEBUG] Initializing Google Ads...');
            const self = this; // Capture widget instance
            
            // Get ad tag ID from config or use default fallback
            // Server sends only the second number (e.g., "227399588")
            const defaultAdTagId = '227399588';
            const adTagId = this.state.serverConfig?.ad_tag_id || defaultAdTagId;
            
            // First numbers differ by platform
            const accountId = '22065771467';
            
            // /23335681243,227399588/Divee.AI/desktop/Divee.AI_banner
            this.log('[Divee DEBUG] Using ad tag ID:', adTagId);
            
            // Build ad paths: /{firstId},{adTagId}/Divee.AI/{platform}/{ad_name}
            const desktopAdPath = `/${accountId},${adTagId}/Divee.AI/desktop/Divee.AI_banner`;
            const mobileAdPath = `/${accountId},${adTagId}/Divee.AI/mobileweb/Divee.AI_cube`;
            this.log('[Divee DEBUG] Desktop ad path:', desktopAdPath);
            this.log('[Divee DEBUG] Mobile ad path:', mobileAdPath);
            
            window.googletag = window.googletag || { cmd: [] };
            window.googletag._initialized_by_divee = true;
            const gptScript = document.createElement('script');
            gptScript.async = true;
            gptScript.src = 'https://securepubads.g.doubleclick.net/tag/js/gpt.js';
            gptScript.crossOrigin = 'anonymous';

            gptScript.onload = function () {
                self.log('[Divee DEBUG] ✓ Google Ads script loaded successfully');
                self.log('[Divee DEBUG] googletag object:', window.googletag);
            };

            gptScript.onerror = function () {
                console.error('[Divee] Failed to load Google Ads script');
            };

            document.head.appendChild(gptScript);
            this.log('[Divee DEBUG] Google Ads script tag added to head');
            this.log('[Divee DEBUG] Script element:', gptScript);

            googletag.cmd.push(function () {
                self.log('[Divee DEBUG] === Inside googletag.cmd.push callback ===');
                self.log('[Divee DEBUG] Defining ad slots...');

                // Collapsed view ads - with responsive size mapping
                const desktopSizeMapping = googletag.sizeMapping()
                    .addSize([1024, 0], [[728, 90], [650, 100]])  // Desktop: standard banner sizes
                    .addSize([768, 0], [[650, 100]])              // Tablet: slightly smaller
                    .addSize([0, 0], [])                          // Mobile: don't show desktop ad
                    .build();
                
                const mobileSizeMapping = googletag.sizeMapping()
                    .addSize([768, 0], [])                        // Desktop/Tablet: don't show mobile ad
                    .addSize([0, 0], [[300, 250], [336, 280]])    // Mobile: cube sizes
                    .build();

                const desktopSlot = googletag.defineSlot(desktopAdPath, [[650, 100], [728, 90]], 'div-gpt-ad-1768979426842-0');
                //const desktopSlot = googletag.defineSlot('/22065771467,227399588/Divee.AI/desktop/Divee.AI_banner', [[650, 100], [728, 90]], 'div-gpt-ad-1768979426842-0');
                self.log('[Divee DEBUG] Desktop slot result:', desktopSlot);
                if (desktopSlot) {
                    desktopSlot.defineSizeMapping(desktopSizeMapping);
                    desktopSlot.addService(googletag.pubads());
                    self.log('[Divee DEBUG] ✓ Desktop ad slot defined with size mapping:', desktopSlot.getSlotElementId());
                } else {
                    console.error('[Divee] Failed to define desktop ad slot');
                }

                const mobileSlot = googletag.defineSlot(mobileAdPath, [[336, 280], [300, 250]], 'div-gpt-ad-1768979511037-0');
                //const mobileSlot = googletag.defineSlot('/22065771467,227399588/Divee.AI/mobileweb/Divee.AI_cube', [[336, 280], [300, 250]], 'div-gpt-ad-1768979511037-0');
                self.log('[Divee DEBUG] Mobile slot result:', mobileSlot);
                if (mobileSlot) {
                    mobileSlot.defineSizeMapping(mobileSizeMapping);
                    mobileSlot.addService(googletag.pubads());
                    self.log('[Divee DEBUG] ✓ Mobile ad slot defined with size mapping:', mobileSlot.getSlotElementId());
                } else {
                    console.error('[Divee] Failed to define mobile ad slot');
                }

                // Expanded view ads - with responsive size mapping
                const desktopSlotExpanded = googletag.defineSlot(desktopAdPath, [[650, 100], [728, 90]], 'div-gpt-ad-expanded-desktop');
                // const desktopSlotExpanded = googletag.defineSlot('/22065771467,227399588/Divee.AI/desktop/Divee.AI_banner', [[650, 100], [728, 90]], 'div-gpt-ad-expanded-desktop');
                self.log('[Divee DEBUG] Expanded desktop slot result:', desktopSlotExpanded);
                if (desktopSlotExpanded) {
                    desktopSlotExpanded.defineSizeMapping(desktopSizeMapping);
                    desktopSlotExpanded.addService(googletag.pubads());
                    self.log('[Divee DEBUG] ✓ Expanded desktop ad slot defined with size mapping:', desktopSlotExpanded.getSlotElementId());
                } else {
                    console.error('[Divee] Failed to define expanded desktop ad slot');
                }

                const mobileSlotExpanded = googletag.defineSlot(mobileAdPath, [[336, 280], [300, 250]], 'div-gpt-ad-expanded-mobile');
                //const mobileSlotExpanded = googletag.defineSlot('/22065771467,227399588/Divee.AI/mobileweb/Divee.AI_cube', [[336, 280], [300, 250]], 'div-gpt-ad-expanded-mobile');
                self.log('[Divee DEBUG] Expanded mobile slot result:', mobileSlotExpanded);
                if (mobileSlotExpanded) {
                    mobileSlotExpanded.defineSizeMapping(mobileSizeMapping);
                    mobileSlotExpanded.addService(googletag.pubads());
                    self.log('[Divee DEBUG] ✓ Expanded mobile ad slot defined with size mapping:', mobileSlotExpanded.getSlotElementId());
                } else {
                    console.error('[Divee] Failed to define expanded mobile ad slot');
                }

                googletag.pubads().collapseEmptyDivs();
                self.log('[Divee DEBUG] Configured to collapse empty ad divs');

                // Note: Lazy loading disabled for faster ad display
                // Since the widget is intentionally placed in content, we want ads ready
                // immediately when users scroll to the widget position
                // googletag.pubads().enableLazyLoad({...});

                // Enable Single Request Architecture (SRA) for faster loading and better fill
                googletag.pubads().enableSingleRequest();
                self.log('[Divee DEBUG] ✓ Single Request Architecture (SRA) enabled');

                // Page-level targeting for better ad relevance and fill rates
                googletag.pubads().setTargeting('content_type', 'article');
                googletag.pubads().setTargeting('display_mode', self.config.displayMode || 'anchored');
                self.log('[Divee DEBUG] ✓ Page-level targeting set');

                googletag.enableServices();
                self.log('[Divee DEBUG] ✓ Google Ads services enabled');
                self.log('[Divee DEBUG] === Finished defining ad slots ===');
            });
        }

        async init() {
            this.log('[Divee] Initializing widget...', this.config);

            // Initialize Analytics IDs
            this.getAnalyticsIds();

            // Load server configuration first (needed for ad_tag_id)
            await this.loadServerConfig();

            // Initialize Google Ads (after config is loaded to get ad_tag_id)
            this.initGoogleAds();

            if (!this.state.serverConfig) {
                this.log('[Divee] Widget disabled due to config load failure');
                return;
            }

            // Extract article content
            this.extractArticleContent();

            // Create widget DOM
            this.createWidget();

            // Attach event listeners
            this.attachEventListeners();

            // Setup visibility tracking
            this.setupVisibilityTracking();

            // Setup analytics batch flush on page unload
            this.setupPageUnloadFlush();

            // Track analytics
            this.trackEvent('widget_loaded', {
                project_id: this.config.projectId,
                article_id: this.config.articleId,
                position: this.config.position
            });
        }

        async loadServerConfig() {
            try {
                const serverConfig = await this.fetchServerConfig(this.config.projectId);
                
                // Track impression separately
                this.trackEvent('impression', {
                    url: this.contentCache.url || window.location.href,
                    referrer: document.referrer
                });

                this.state.serverConfig = serverConfig;
                this.log('[Divee] Server config loaded:', this.state.serverConfig);

                // Apply display settings from server config (override data attributes)
                if (serverConfig.display_mode) {
                    this.config.displayMode = serverConfig.display_mode;
                    this.log('[Divee] Display mode from config:', serverConfig.display_mode);
                }
                if (serverConfig.display_position) {
                    this.config.floatingPosition = serverConfig.display_position;
                    this.log('[Divee] Display position from config:', serverConfig.display_position);
                }
                if (serverConfig.anchored_position) {
                    // Only allow 'top' or 'bottom', default to 'bottom'
                    this.config.anchoredPosition = ['top', 'bottom'].includes(serverConfig.anchored_position) 
                        ? serverConfig.anchored_position 
                        : 'bottom';
                    this.log('[Divee] Anchored position from config:', this.config.anchoredPosition);
                }
                if (serverConfig.article_class) {
                    this.config.articleClass = serverConfig.article_class;
                    this.log('[Divee] Article class from config:', serverConfig.article_class);
                }
                if (serverConfig.widget_container_class) {
                    this.config.containerSelector = serverConfig.widget_container_class;
                    this.log('[Divee] Container selector from config:', serverConfig.widget_container_class);
                }

                // Apply direction and language
                if (serverConfig.direction) {
                    this.elements.container?.setAttribute('dir', serverConfig.direction);
                }
                if (serverConfig.language) {
                    this.elements.container?.setAttribute('lang', serverConfig.language);
                }
                
                // Apply highlight colors as CSS custom properties
                this.applyThemeColors(serverConfig);

                // URL param overrides (for testing/debugging)
                const urlParams = new URLSearchParams(window.location.search);
                const overrideDisplayMode = urlParams.get('diveeOverrideDisplayMode');
                const overrideDisplayPosition = urlParams.get('diveeOverrideDisplayPosition');
                const overrideArticleClass = urlParams.get('diveeOverrideArticleClass');
                const overrideContainerSelector = urlParams.get('diveeOverrideContainerSelector');
                
                // Always log overrides (not just in debug mode)
                if (overrideDisplayMode || overrideDisplayPosition || overrideArticleClass || overrideContainerSelector) {
                    this.log('[Divee] URL param overrides detected:', {
                        displayMode: overrideDisplayMode,
                        displayPosition: overrideDisplayPosition,
                        articleClass: overrideArticleClass,
                        containerSelector: overrideContainerSelector
                    });
                }
                
                if (overrideDisplayMode) {
                    this.config.displayMode = overrideDisplayMode;
                    this.log('[Divee] Display mode overridden by URL param:', overrideDisplayMode);
                }
                if (overrideDisplayPosition) {
                    // For floating mode positions (bottom-right, bottom-left, etc.)
                    this.config.floatingPosition = overrideDisplayPosition;
                    // For anchored mode positions (top, bottom)
                    if (['top', 'bottom'].includes(overrideDisplayPosition)) {
                        this.config.anchoredPosition = overrideDisplayPosition;
                    }
                    this.log('[Divee] Display position overridden by URL param:', overrideDisplayPosition);
                }
                if (overrideArticleClass) {
                    this.config.articleClass = overrideArticleClass;
                    this.log('[Divee] Article class overridden by URL param:', overrideArticleClass);
                }
                if (overrideContainerSelector) {
                    this.config.containerSelector = overrideContainerSelector;
                    this.log('[Divee] Container selector overridden by URL param:', overrideContainerSelector);
                }
                
                // Log final config after all overrides
                this.log('[Divee] Final config after overrides:', {
                    displayMode: this.config.displayMode,
                    floatingPosition: this.config.floatingPosition,
                    anchoredPosition: this.config.anchoredPosition,
                    articleClass: this.config.articleClass,
                    containerSelector: this.config.containerSelector
                });
            } catch (error) {
                console.error('[Divee] Failed to load config:', error);
                this.state.serverConfig = null;
            }
        }

        applyThemeColors(config) {
            if (!this.elements.container) return;
            
            const colors = config?.highlight_color || this.getDefaultConfig().highlight_color;
            
            if (Array.isArray(colors) && colors.length >= 2) {
                this.elements.container.style.setProperty('--divee-color-primary', colors[0]);
                this.elements.container.style.setProperty('--divee-color-secondary', colors[1]);
                this.log('[Divee] Applied theme colors:', colors[0], colors[1]);
            }
        }

        async fetchServerConfig(projectId) {
            if (!this.config.cachedBaseUrl) {
                throw new Error('Missing cachedBaseUrl');
            }

            const configUrl = `${this.config.cachedBaseUrl}/config?projectId=${encodeURIComponent(projectId)}`;

            const response = await fetch(configUrl, {
                method: 'GET'
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
                this.log('[Divee] Using cached content');
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

                // Extract social share image metadata
                const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content') ||
                               document.querySelector('meta[name="twitter:image"]')?.getAttribute('content') ||
                               null;
                
                const articleImage = document.querySelector('article img')?.src ||
                                   document.querySelector('[role="article"] img')?.src ||
                                   null;

                // Cache the extracted content
                this.contentCache = {
                    content: this.articleContent,
                    title: this.articleTitle,
                    url: this.articleUrl,
                    image_url: articleImage,
                    og_image: ogImage,
                    extracted: true
                };

                this.log('[Divee] Article extracted and cached:', {
                    title: this.articleTitle,
                    url: this.articleUrl,
                    contentLength: this.articleContent.length,
                    hasOgImage: !!ogImage,
                    hasArticleImage: !!articleImage
                });
            } catch (error) {
                console.error('[Divee] Error extracting content:', error);
                // Fallback to basic extraction
                this.articleTitle = document.title || 'Untitled Article';
                this.articleContent = document.body.textContent.trim();
                this.articleUrl = window.location.href;
                
                this.contentCache = {
                    content: this.articleContent,
                    title: this.articleTitle,
                    url: this.articleUrl,
                    image_url: null,
                    og_image: null,
                    extracted: true
                };
            }
        }

        createWidget() {
            // Debug: Log config values at widget creation time
            this.log('[Divee] createWidget called with config:', {
                displayMode: this.config.displayMode,
                floatingPosition: this.config.floatingPosition,
                anchoredPosition: this.config.anchoredPosition
            });
            
            // Create container
            const container = document.createElement('div');
            container.className = 'divee-widget';
            container.setAttribute('data-state', 'collapsed');
            
            // Apply display mode
            if (this.config.displayMode === 'floating') {
                this.log('[Divee] Applying floating mode with position:', this.config.floatingPosition);
                container.classList.add('divee-widget-floating');
                container.setAttribute('data-floating-position', this.config.floatingPosition);
            } else {
                this.log('[Divee] Anchored mode, position:', this.config.anchoredPosition);
            }

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

            // Apply initial theme colors (will be updated when server config loads)
            this.applyThemeColors(this.state.serverConfig || this.getDefaultConfig());

            // Insert into page
            this.insertWidget(container);
        }

        createCollapsedView() {
            const view = document.createElement('div');
            view.className = 'divee-collapsed';

            const config = this.state.serverConfig || this.getDefaultConfig();
            // Hide ads in floating mode collapsed view
            const showAd = (config.show_ad && this.config.displayMode !== 'floating') ? '' : 'style="display: none;"';

            this.log('[Divee DEBUG] Creating collapsed view with showAd:', showAd);
            this.log('[Divee DEBUG] config.show_ad:', config.show_ad);
            
            view.innerHTML = `
                <div class="divee-powered-by-collapsed">
                    <a class="divee-powered-by" href="https://www.divee.ai" target="_blank" rel="noopener noreferrer">powered by divee.ai</a>
                </div>
                <div class="divee-search-container-collapsed">
                    <img class="divee-icon-ai-collapsed" src="https://srv.divee.ai/storage/v1/object/public/public-files/ai.png" alt="AI icon" />
                    <img class="divee-icon-site-collapsed" src="${config.icon_url}" alt="Site icon" />
                    <input type="text" class="divee-search-input-collapsed" placeholder="" readonly />
                    <svg class="divee-send-icon-collapsed" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        </div>
                <div class="divee-ad-slot" ${showAd}>
                    <!-- Desktop Ad -->
                    <div id='div-gpt-ad-1768979426842-0' class='divee-ad-desktop' style='min-width: 650px; min-height: 90px; margin: 0 !important;'></div>
                    <!-- Mobile Ad -->
                    <div id='div-gpt-ad-1768979511037-0' class='divee-ad-mobile' style='min-width: 300px; min-height: 250px;'></div>
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
                            <img class="divee-icon-site-collapsed" src="https://srv.divee.ai/storage/v1/object/public/public-files/ai.png" alt="AI icon" />
                            <img class="divee-icon-site" src="${config.icon_url}" alt="Site icon" />
                        </div>
                        <span class="divee-title">${config.client_name}</span>
                        <a class="divee-powered-by" href="https://www.divee.ai" target="_blank" rel="noopener noreferrer">powered by divee.ai</a>
                        <button class="divee-close" aria-label="Close">✕</button>
                    </div>
                </div>
                <div class="divee-content">
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
            
            <!-- Ad Slot in Expanded View -->
            <div class="divee-ad-slot-expanded" style="margin-top: 5px; display: flex; justify-content: center;">
                <!-- Desktop Ad -->
                <div id='div-gpt-ad-expanded-desktop' class='divee-ad-desktop' style='min-width: 650px; min-height: 90px; margin: 0 !important;'></div>
                <!-- Mobile Ad -->
                <div id='div-gpt-ad-expanded-mobile' class='divee-ad-mobile' style='min-width: 300px; min-height: 250px;  margin: 0 !important;'></div>
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
            this.log('[Divee] insertWidget called with config:', {
                displayMode: this.config.displayMode,
                anchoredPosition: this.config.anchoredPosition,
                containerSelector: this.config.containerSelector
            });
            this.log('[Divee] Display mode:', this.config.displayMode);
            this.log('[Divee] Config containerSelector (from server):', this.config.containerSelector);

            // For floating mode, always append to body
            if (this.config.displayMode === 'floating') {
                this.log('[Divee] Floating mode: appending to body');
                document.body.appendChild(container);
                this.displayAdsIfNeeded();
                return;
            }

            let targetElement = null;

            // First, try custom container selector if provided
            if (this.config.containerSelector) {
                this.log('[Divee] ✓ Using containerSelector from server config:', this.config.containerSelector);
                this.log('[Divee] Attempting to find element with querySelector:', this.config.containerSelector);
                targetElement = document.querySelector(this.config.containerSelector);
                if (targetElement) {
                    this.log('[Divee] ✓ Found custom container element:', {
                        selector: this.config.containerSelector,
                        tagName: targetElement.tagName,
                        className: targetElement.className,
                        id: targetElement.id
                    });
                } else {
                    this.log(`[Divee] ✗ Container selector "${this.config.containerSelector}" not found in DOM, falling back to default behavior`);
                }
            } else {
                this.log('[Divee] No containerSelector from server config, using default auto-detection');
            }

            // Fallback to default behavior
            if (!targetElement) {
                this.log('[Divee] Looking for default containers (article, [role="article"], main)');
                targetElement = document.querySelector('article') ||
                    document.querySelector('[role="article"]') ||
                    document.querySelector('main');
                if (targetElement) {
                    this.log('[Divee] ✓ Found default container:', targetElement.tagName, targetElement.className);
                } else {
                    this.log('[Divee] ✗ No default container found, will append to body');
                }
            }

            // Insert widget based on anchored position
            if (targetElement) {
                this.log('[Divee] Inserting widget to target element, position:', this.config.anchoredPosition);
                if (this.config.anchoredPosition === 'top') {
                    this.log('[Divee] Using prepend() for top position');
                    targetElement.prepend(container);
                } else {
                    this.log('[Divee] Using appendChild() for bottom position');
                    targetElement.appendChild(container);
                }
            } else {
                // Final fallback: append to body if nothing found
                this.log('[Divee] No suitable container found, appending to body as fallback');
                if (this.config.anchoredPosition === 'top') {
                    document.body.prepend(container);
                } else {
                    document.body.appendChild(container);
                }
            }

            this.log('[Divee] Widget inserted successfully');

            this.displayAdsIfNeeded();
        }

        displayAdsIfNeeded() {
            // Display ads after widget is in DOM
            const config = this.state.serverConfig || this.getDefaultConfig();
            this.log('[Divee DEBUG] ====== AD DISPLAY CHECK ======');
            this.log('[Divee DEBUG] show_ad_config:', config.show_ad);
            this.log('[Divee DEBUG] googletag_defined:', !!window.googletag);
            this.log('[Divee DEBUG] googletag object:', window.googletag);
            this.log('[Divee DEBUG] googletag.cmd length:', window.googletag?.cmd?.length);
            this.log('[Divee DEBUG] desktop_element exists:', !!document.getElementById('div-gpt-ad-1768979426842-0'));
            this.log('[Divee DEBUG] mobile_element exists:', !!document.getElementById('div-gpt-ad-1768979511037-0'));
            this.log('[Divee DEBUG] Will display ads:', config.show_ad && window.googletag);

            if (config.show_ad && window.googletag) {
                const self = this; // Capture widget instance
                self.log('[Divee DEBUG] Queueing ad display via googletag.cmd...');
                
                // Use googletag.cmd.push instead of setTimeout - it automatically waits for GPT to be ready
                googletag.cmd.push(function () {
                    self.log('[Divee DEBUG] === GPT ready, displaying ads ===');
                    self.log('[Divee DEBUG] Inside display cmd callback...');
                    self.log('[Divee DEBUG] Requesting ad display for slots...');

                        self.log('[Divee DEBUG] Calling googletag.display for desktop...');
                        googletag.display('div-gpt-ad-1768979426842-0');
                        self.log('[Divee DEBUG] ✓ Display called for div-gpt-ad-1768979426842-0 (desktop)');

                        self.log('[Divee DEBUG] Calling googletag.display for mobile...');
                        googletag.display('div-gpt-ad-1768979511037-0');
                        self.log('[Divee DEBUG] ✓ Display called for div-gpt-ad-1768979511037-0 (mobile)');

                        // Listen for ad slot rendering
                        self.log('[Divee DEBUG] Setting up event listeners...');
                        let emptyAdCount = 0;
                        
                        // Only track Divee's own ad slots
                        const diveeAdSlotIds = [
                            'div-gpt-ad-1768979426842-0',  // desktop collapsed
                            'div-gpt-ad-1768979511037-0',  // mobile collapsed
                            'div-gpt-ad-expanded-desktop', // desktop expanded
                            'div-gpt-ad-expanded-mobile'   // mobile expanded
                        ];
                        
                        googletag.pubads().addEventListener('slotRenderEnded', function (event) {
                            const slotId = event.slot.getSlotElementId();
                            
                            // Ignore ads that aren't ours
                            if (!diveeAdSlotIds.includes(slotId)) {
                                self.log('[Divee DEBUG] Ignoring non-Divee ad slot:', slotId);
                                return;
                            }
                            
                            const adElement = document.getElementById(slotId);

                            self.log('[Divee DEBUG] ====== AD RENDER EVENT ======');
                            self.log('[Divee DEBUG] Slot:', slotId);
                            self.log('[Divee DEBUG] isEmpty:', event.isEmpty);
                            self.log('[Divee DEBUG] size:', event.size);
                            self.log('[Divee DEBUG] advertiserId:', event.advertiserId);
                            self.log('[Divee DEBUG] lineItemId:', event.lineItemId);
                            self.log('[Divee DEBUG] creativeId:', event.creativeId);
                            self.log('[Divee DEBUG] element_exists:', !!adElement);
                            self.log('[Divee DEBUG] adElement:', adElement);

                            if (event.isEmpty && adElement) {
                                adElement.style.display = 'none';
                                emptyAdCount++;
                                self.log('[Divee DEBUG] Ad slot hidden (empty):', slotId, `(${emptyAdCount}/2 empty)`);

                                // Track unfilled ad impression for analytics
                                self.trackEvent('ad_unfilled', {
                                    ad_unit: slotId,
                                    position: slotId.includes('expanded') ? 'expanded' : 'collapsed',
                                    reason: 'no_fill'
                                });

                                // If both ads are empty, hide the entire ad slot container
                                if (emptyAdCount === 2) {
                                    const adSlot = document.querySelector('.divee-ad-slot');
                                    if (adSlot) {
                                        adSlot.style.display = 'none';
                                        self.log('[Divee DEBUG] Ad slot container hidden (all ads empty)');
                                    }
                                }
                            } else if (!event.isEmpty) {
                                self.log('[Divee DEBUG] Ad successfully rendered:', slotId);
                                
                                // Track ad impression
                                self.trackEvent('ad_impression', {
                                    ad_unit: slotId,
                                    position: slotId.includes('expanded') ? 'expanded' : 'collapsed',
                                    size: event.size ? `${event.size[0]}x${event.size[1]}` : 'unknown',
                                    advertiser_id: event.advertiserId || null,
                                    creative_id: event.creativeId || null,
                                    line_item_id: event.lineItemId || null
                                });
                                
                                // Add click tracking to the ad element
                                if (adElement) {
                                    self.setupAdClickTracking(adElement, slotId, event);
                                }
                            }
                        });

                        // Listen for slot loaded
                        googletag.pubads().addEventListener('slotOnload', function (event) {
                            self.log('[Divee DEBUG] Ad slot loaded:', event.slot.getSlotElementId());
                        });

                        // Listen for slot requested
                        googletag.pubads().addEventListener('slotRequested', function (event) {
                            self.log('[Divee DEBUG] Ad slot requested:', event.slot.getSlotElementId());
                        });

                        // Listen for slot response received
                        googletag.pubads().addEventListener('slotResponseReceived', function (event) {
                            self.log('[Divee DEBUG] Ad slot response received:', event.slot.getSlotElementId());
                        });
                    });
            } else {
                this.log('[Divee WARNING] Ads NOT displayed!');
                this.log('[Divee WARNING] Reason:', !config.show_ad ? 'show_ad is false in config' : 'googletag not available');
                this.log('[Divee WARNING] config.show_ad:', config.show_ad);
                this.log('[Divee WARNING] window.googletag:', !!window.googletag);
            }
        }

        displayExpandedAds() {
            const config = this.state.serverConfig || this.getDefaultConfig();
            if (!config.show_ad || !window.googletag) {
                this.log('[Divee DEBUG] Skipping expanded ads display');
                return;
            }

            const self = this;
            const now = Date.now();
            const throttleInterval = 30000; // 30 seconds minimum between refreshes (Google policy)
            const timeSinceLastRefresh = now - this.state.lastAdRefresh;
            
            this.log('[Divee DEBUG] Displaying expanded view ads...');
            this.log('[Divee DEBUG] Time since last refresh:', timeSinceLastRefresh, 'ms');
            
            googletag.cmd.push(function () {
                self.log('[Divee DEBUG] Requesting expanded ad display...');
                
                const desktopEl = document.getElementById('div-gpt-ad-expanded-desktop');
                const mobileEl = document.getElementById('div-gpt-ad-expanded-mobile');
                
                // First time: just display the ads
                if (!self.state.expandedAdsDisplayed) {
                    if (desktopEl) {
                        googletag.display('div-gpt-ad-expanded-desktop');
                        self.log('[Divee DEBUG] ✓ Display called for expanded desktop ad');
                    }
                    
                    if (mobileEl) {
                        googletag.display('div-gpt-ad-expanded-mobile');
                        self.log('[Divee DEBUG] ✓ Display called for expanded mobile ad');
                    }
                    
                    self.state.expandedAdsDisplayed = true;
                    self.state.lastAdRefresh = now;
                    self.log('[Divee DEBUG] Expanded ads displayed for first time');
                }
                // Subsequent expansions: refresh if throttle period has passed
                else if (timeSinceLastRefresh >= throttleInterval) {
                    // Get the slot objects for refresh
                    const slots = googletag.pubads().getSlots().filter(slot => {
                        const slotId = slot.getSlotElementId();
                        return slotId === 'div-gpt-ad-expanded-desktop' || slotId === 'div-gpt-ad-expanded-mobile';
                    });
                    
                    if (slots.length > 0) {
                        googletag.pubads().refresh(slots);
                        self.state.lastAdRefresh = now;
                        self.log('[Divee DEBUG] ✓ Refreshed expanded ads (', slots.length, 'slots)');
                        self.trackEvent('ad_refresh', {
                            slots: slots.map(s => s.getSlotElementId()),
                            time_since_last: timeSinceLastRefresh
                        });
                    }
                } else {
                    self.log('[Divee DEBUG] Skipping refresh - throttled (', throttleInterval - timeSinceLastRefresh, 'ms remaining)');
                }
            });
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
                
                // Display expanded view ads
                this.displayExpandedAds();
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
                content: this.contentCache.content,
                visitor_id: this.state.visitorId,
                session_id: this.state.sessionId,
                metadata: {
                    image_url: this.contentCache.image_url,
                    og_image: this.contentCache.og_image
                }
            };

            try {
                const response = await fetch(`${this.config.nonCacheBaseUrl}/suggestions`, {
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
                content: this.contentCache.content,
                visitor_id: this.state.visitorId,
                session_id: this.state.sessionId,
                conversation_id: this.state.conversationId, // Include if exists
                metadata: {
                    image_url: this.contentCache.image_url,
                    og_image: this.contentCache.og_image
                }
            };

            const response = await fetch(`${this.config.nonCacheBaseUrl}/chat`, {
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
                if (response.status === 429) {
                    const errorData = await response.json().catch(() => ({}));
                    this.updateMessage(messageId, errorData.error || 'Too many requests. Please try again later.');
                    const messageDiv = this.elements.expandedView.querySelector(`[data-message-id="${messageId}"]`);
                    const cursor = messageDiv?.querySelector('.divee-cursor');
                    if (cursor) cursor.remove();
                    return;
                }
                throw new Error(`Chat request failed: ${response.status}`);
            }

            // Store conversation ID from response header
            const conversationId = response.headers.get('X-Conversation-Id');
            if (conversationId && !this.state.conversationId) {
                this.state.conversationId = conversationId;
                const conversationKey = `divee_conversation_${window.location.href}`;
                sessionStorage.setItem(conversationKey, conversationId);
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

            // Increment AI response count and check if we should show a suggestion
            this.state.aiResponseCount++;
            await this.maybeShowSuggestionCard();
        }

        async maybeShowSuggestionCard() {
            // Show suggestion card after every 2nd AI response (#2, #4, #6, #8...)
            if (!this.state.suggestionsSuppressed && this.state.aiResponseCount % 2 === 0) {
                await this.showSuggestionCard();
            }
        }

        async fetchSuggestedArticle() {
            const payload = {
                projectId: this.config.projectId,
                currentUrl: this.contentCache.url,
                conversationId: this.state.conversationId
            };

            try {
                const response = await fetch(`${this.config.nonCacheBaseUrl}/suggested-articles`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    throw new Error(`Suggested articles request failed: ${response.status}`);
                }

                const data = await response.json();
                return data.suggestion || null;
            } catch (error) {
                console.error('[Divee] Failed to fetch suggested article:', error);
                return null;
            }
        }

        async showSuggestionCard() {
            const suggestion = await this.fetchSuggestedArticle();
            
            // Don't show card if no suggestions available
            if (!suggestion) return;

            const messagesContainer = this.elements.expandedView.querySelector('.divee-messages');
            const chatContainer = this.elements.expandedView.querySelector('.divee-chat');
            
            const cardId = `suggestion-${Date.now()}`;
            const card = this.createSuggestionCard(suggestion, cardId);
            messagesContainer.appendChild(card);
            
            // Scroll to bottom
            chatContainer.scrollTop = chatContainer.scrollHeight;

            // Track analytics
            this.trackEvent('suggestion_shown', {
                article_id: suggestion.unique_id,
                conversation_id: this.state.conversationId,
                position_in_chat: this.state.aiResponseCount
            });
        }

        createSuggestionCard(suggestion, cardId) {
            const card = document.createElement('div');
            card.className = 'divee-suggestion-card';
            card.setAttribute('data-card-id', cardId);
            card.setAttribute('role', 'link');
            card.setAttribute('tabindex', '0');
            card.setAttribute('aria-label', `Suggested article: ${suggestion.title}`);

            const imageUrl = suggestion.image_url || 'https://srv.divee.ai/storage/v1/object/public/public-files/placeholder.jpg';
            
            card.innerHTML = `
                <button class="divee-suggestion-dismiss" aria-label="Dismiss suggestion">✕</button>
                <div class="divee-suggestion-image">
                    <img src="${imageUrl}" alt="${suggestion.title}" />
                </div>
                <div class="divee-suggestion-text">
                    <div class="divee-suggestion-label">DIVE DEEPER...</div>
                    <div class="divee-suggestion-title">${suggestion.title}</div>
                </div>
            `;

            // Handle card click (open article)
            card.addEventListener('click', (e) => {
                if (!e.target.closest('.divee-suggestion-dismiss')) {
                    this.trackEvent('suggestion_clicked', {
                        article_id: suggestion.unique_id,
                        conversation_id: this.state.conversationId,
                        position_in_chat: this.state.aiResponseCount
                    });
                    window.open(suggestion.url, '_blank');
                }
            });

            // Handle Enter/Space for accessibility
            card.addEventListener('keydown', (e) => {
                if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('.divee-suggestion-dismiss')) {
                    e.preventDefault();
                    this.trackEvent('suggestion_clicked', {
                        article_id: suggestion.unique_id,
                        conversation_id: this.state.conversationId,
                        position_in_chat: this.state.aiResponseCount
                    });
                    window.open(suggestion.url, '_blank');
                }
            });

            // Handle dismiss button
            const dismissBtn = card.querySelector('.divee-suggestion-dismiss');
            dismissBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.trackEvent('suggestion_x_clicked', {
                    article_id: suggestion.unique_id,
                    conversation_id: this.state.conversationId,
                    position_in_chat: this.state.aiResponseCount
                });
                this.showDismissalConfirmation(card, cardId, suggestion);
            });

            return card;
        }

        showDismissalConfirmation(card, cardId, suggestion) {
            // Transform card to confirmation state
            card.classList.add('divee-suggestion-dismissing');
            card.innerHTML = `
                <div class="divee-suggestion-confirm">
                    <div class="divee-suggestion-confirm-title">Don't show suggestions in this chat?</div>
                    <div class="divee-suggestion-confirm-subtitle">(You'll miss related articles)</div>
                    <div class="divee-suggestion-confirm-actions">
                        <button class="divee-btn-ghost divee-cancel-dismiss">Cancel</button>
                        <button class="divee-btn-primary divee-confirm-dismiss">Yes, hide them</button>
                    </div>
                </div>
            `;

            // Handle cancel
            const cancelBtn = card.querySelector('.divee-cancel-dismiss');
            cancelBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.trackEvent('suggestion_dismissed_cancelled', {
                    article_id: suggestion.unique_id,
                    conversation_id: this.state.conversationId
                });
                // Remove the card
                card.style.opacity = '0';
                setTimeout(() => card.remove(), 200);
            });

            // Handle confirm
            const confirmBtn = card.querySelector('.divee-confirm-dismiss');
            confirmBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.trackEvent('suggestion_dismissed_confirmed', {
                    article_id: suggestion.unique_id,
                    conversation_id: this.state.conversationId
                });
                this.suppressSuggestions();
                // Remove the card
                card.style.opacity = '0';
                setTimeout(() => card.remove(), 200);
            });
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

        setupAdClickTracking(adElement, slotId, eventData) {
            const self = this;
            
            // Track clicks on the ad container (debug logging only, no analytics event)
            adElement.addEventListener('click', function(e) {
                self.log('[Divee DEBUG] Ad clicked:', slotId);
            });
            
            // Also track clicks on any links inside the ad (for additional granularity)
            setTimeout(() => {
                const iframe = adElement.querySelector('iframe');
                if (iframe) {
                    try {
                        // Note: Due to cross-origin restrictions, we can't directly access iframe content
                        // But we can detect when the iframe loses focus (indicating a click)
                        iframe.addEventListener('load', function() {
                            self.log('[Divee DEBUG] Ad iframe loaded:', slotId);
                        });
                    } catch (e) {
                        // Expected for cross-origin iframes
                        self.log('[Divee DEBUG] Cannot access iframe content (cross-origin)');
                    }
                }
            }, 100);
        }

        trackEvent(eventName, data = {}) {
            this.log('[Divee Analytics]', eventName, data);
            
            // Get visitor and session IDs from state (already initialized in init())
            const visitorId = this.state.visitorId;
            const sessionId = this.state.sessionId;
            const projectId = this.config.projectId;
            
            if (!projectId) {
                console.warn('[Divee Analytics] No project ID available for tracking');
                return;
            }
            
            if (!visitorId || !sessionId) {
                console.warn('[Divee Analytics] Missing visitor or session IDs');
                return;
            }
            
            // Prepare event payload
            const event = {
                project_id: projectId,
                visitor_id: visitorId,
                session_id: sessionId,
                event_type: eventName,
                event_label: data.label || null,
                event_data: data,
                timestamp: Date.now()
            };
            
            // Check if this event should be sent immediately
            if (this.analyticsConfig.immediateEvents.includes(eventName)) {
                this.sendAnalyticsBatch([event]);
                return;
            }
            
            // Add to queue
            this.analyticsQueue.push(event);
            this.log('[Divee Analytics] Queued event, queue size:', this.analyticsQueue.length);
            
            // Flush if queue is full
            if (this.analyticsQueue.length >= this.analyticsConfig.maxBatchSize) {
                this.flushAnalytics();
                return;
            }
            
            // Reset flush timer
            this.scheduleAnalyticsFlush();
        }

        scheduleAnalyticsFlush() {
            // Clear existing timer
            if (this.analyticsFlushTimer) {
                clearTimeout(this.analyticsFlushTimer);
            }
            
            // Set new timer
            this.analyticsFlushTimer = setTimeout(() => {
                this.flushAnalytics();
            }, this.analyticsConfig.flushInterval);
        }

        flushAnalytics() {
            // Clear timer
            if (this.analyticsFlushTimer) {
                clearTimeout(this.analyticsFlushTimer);
                this.analyticsFlushTimer = null;
            }
            
            // Nothing to flush
            if (this.analyticsQueue.length === 0) {
                return;
            }
            
            // Get events and clear queue
            const events = [...this.analyticsQueue];
            this.analyticsQueue = [];
            
            this.log('[Divee Analytics] Flushing batch of', events.length, 'events');
            this.sendAnalyticsBatch(events);
        }

        sendAnalyticsBatch(events) {
            if (events.length === 0) return;
            
            try {
                const endpoint = `${this.config.nonCacheBaseUrl}/analytics`;
                const payload = events.length === 1 ? events[0] : { batch: events };
                
                fetch(endpoint, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload),
                    keepalive: true
                }).catch(err => {
                    console.error('[Divee Analytics] Failed to send batch:', err);
                });
            } catch (err) {
                console.error('[Divee Analytics] Error sending batch:', err);
            }
        }

        setupVisibilityTracking() {
            // Track when widget becomes visible in viewport (fires once per session)
            if (!this.elements.container || this.state.widgetVisibleTracked) {
                return;
            }

            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting && !this.state.widgetVisibleTracked) {
                        this.state.widgetVisibleTracked = true;
                        
                        this.trackEvent('widget_visible', {
                            url: this.contentCache.url || window.location.href,
                            display_mode: this.config.displayMode,
                            viewport_width: window.innerWidth,
                            viewport_height: window.innerHeight
                        });
                        
                        this.log('[Divee] Widget visible event fired');
                        
                        // Disconnect observer after firing once
                        observer.disconnect();
                    }
                });
            }, {
                threshold: 0.5  // Fire when 50% of widget is visible
            });

            observer.observe(this.elements.container);
        }

        setupPageUnloadFlush() {
            // Flush analytics on page unload
            const flushOnUnload = () => {
                if (this.analyticsQueue.length > 0) {
                    const events = [...this.analyticsQueue];
                    this.analyticsQueue = [];
                    
                    // Use sendBeacon for reliable delivery on page unload
                    const endpoint = `${this.config.nonCacheBaseUrl}/analytics`;
                    const payload = events.length === 1 ? events[0] : { batch: events };
                    
                    if (navigator.sendBeacon) {
                        navigator.sendBeacon(endpoint, JSON.stringify(payload));
                    } else {
                        // Fallback to sync XHR (blocking but reliable)
                        const xhr = new XMLHttpRequest();
                        xhr.open('POST', endpoint, false);
                        xhr.setRequestHeader('Content-Type', 'application/json');
                        xhr.send(JSON.stringify(payload));
                    }
                }
            };
            
            window.addEventListener('pagehide', flushOnUnload);
            window.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'hidden') {
                    flushOnUnload();
                }
            });
        }
    }

    // Auto-initialize from script tag
    function autoInit() {
        const scripts = document.querySelectorAll('script[data-project-id]');
        const urlParams = new URLSearchParams(window.location.search);
        const isDebug = urlParams.get('diveeDebug') === 'true';

        if (isDebug) {
            console.log('[Divee DEBUG] Found', scripts.length, 'widget script(s)');
        }

        scripts.forEach((script, index) => {
            const config = {
                projectId: script.getAttribute('data-project-id'),
                cachedBaseUrl: "https://cdn.divee.ai/functions/v1",
                nonCacheBaseUrl: "https://srv.divee.ai/functions/v1"
            };

            // Show deprecation warnings if data attributes are used
            if (isDebug) {
                if (script.getAttribute('data-display-mode')) {
                    console.warn('[Divee] DEPRECATED: data-display-mode is deprecated. Configure display_mode in your project settings.');
                }
                if (script.getAttribute('data-floating-position')) {
                    console.warn('[Divee] DEPRECATED: data-floating-position is deprecated. Configure display_position in your project settings.');
                }
                if (script.getAttribute('data-article-class')) {
                    console.warn('[Divee] DEPRECATED: data-article-class is deprecated. Configure article_class in your project settings.');
                }
                if (script.getAttribute('data-container-selector')) {
                    console.warn('[Divee] DEPRECATED: data-container-selector is deprecated. Configure widget_container_class in your project settings.');
                }
            }

            if (isDebug) {
                console.log(`[Divee] Auto-init config [${index}]:`, config);
            }
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

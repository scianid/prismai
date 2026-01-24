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
                apiBaseUrl: config.apiBaseUrl || 'http://localhost:3000/api/v1',
                // These will be populated from server config
                displayMode: 'anchored',
                floatingPosition: 'bottom-right',
                articleClass: null,
                containerSelector: null
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

        isDebugMode() {
            const urlParams = new URLSearchParams(window.location.search);
            return urlParams.get('diveeDebug') === 'true';
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

                // Collapsed view ads
                const desktopSlot = googletag.defineSlot('/22065771467,227399588/Divee.AI/desktop/Divee.AI_banner', [[650, 100], [728, 90]], 'div-gpt-ad-1768979426842-0');
                self.log('[Divee DEBUG] Desktop slot result:', desktopSlot);
                if (desktopSlot) {
                    desktopSlot.addService(googletag.pubads());
                    self.log('[Divee DEBUG] ✓ Desktop ad slot defined:', desktopSlot.getSlotElementId());
                } else {
                    console.error('[Divee] Failed to define desktop ad slot');
                }

                const mobileSlot = googletag.defineSlot('/22065771467,227399588/Divee.AI/mobileweb/Divee.AI_cube', [[336, 280], [300, 250]], 'div-gpt-ad-1768979511037-0');
                self.log('[Divee DEBUG] Mobile slot result:', mobileSlot);
                if (mobileSlot) {
                    mobileSlot.addService(googletag.pubads());
                    self.log('[Divee DEBUG] ✓ Mobile ad slot defined:', mobileSlot.getSlotElementId());
                } else {
                    console.error('[Divee] Failed to define mobile ad slot');
                }

                // Expanded view ads
                const desktopSlotExpanded = googletag.defineSlot('/22065771467,227399588/Divee.AI/desktop/Divee.AI_banner', [[650, 100], [728, 90]], 'div-gpt-ad-expanded-desktop');
                self.log('[Divee DEBUG] Expanded desktop slot result:', desktopSlotExpanded);
                if (desktopSlotExpanded) {
                    desktopSlotExpanded.addService(googletag.pubads());
                    self.log('[Divee DEBUG] ✓ Expanded desktop ad slot defined:', desktopSlotExpanded.getSlotElementId());
                } else {
                    console.error('[Divee] Failed to define expanded desktop ad slot');
                }

                const mobileSlotExpanded = googletag.defineSlot('/22065771467,227399588/Divee.AI/mobileweb/Divee.AI_cube', [[336, 280], [300, 250]], 'div-gpt-ad-expanded-mobile');
                self.log('[Divee DEBUG] Expanded mobile slot result:', mobileSlotExpanded);
                if (mobileSlotExpanded) {
                    mobileSlotExpanded.addService(googletag.pubads());
                    self.log('[Divee DEBUG] ✓ Expanded mobile ad slot defined:', mobileSlotExpanded.getSlotElementId());
                } else {
                    console.error('[Divee] Failed to define expanded mobile ad slot');
                }

                googletag.pubads().collapseEmptyDivs();
                self.log('[Divee DEBUG] Configured to collapse empty ad divs');

                googletag.enableServices();
                self.log('[Divee DEBUG] ✓ Google Ads services enabled');
                self.log('[Divee DEBUG] === Finished defining ad slots ===');
            });
        }

        async init() {
            this.log('[Divee] Initializing widget...', this.config);

            // Initialize Analytics IDs
            this.getAnalyticsIds();

            // Initialize Google Ads
            this.initGoogleAds();

            // Load server configuration
            await this.loadServerConfig();

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
                    article_content: this.contentCache.content || this.articleContent,
                    visitor_id: this.state.visitorId,
                    session_id: this.state.sessionId,
                    referrer: document.referrer,
                    user_agent: navigator.userAgent
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
            } catch (error) {
                console.error('[Divee] Failed to load config:', error);
                this.state.serverConfig = null;
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

                // Cache the extracted content
                this.contentCache = {
                    content: this.articleContent,
                    title: this.articleTitle,
                    url: this.articleUrl,
                    extracted: true
                };

                this.log('[Divee] Article extracted and cached:', {
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
            
            // Apply display mode
            if (this.config.displayMode === 'floating') {
                container.classList.add('divee-widget-floating');
                container.setAttribute('data-floating-position', this.config.floatingPosition);
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
            this.log('[Divee] insertWidget called');
            this.log('[Divee] Display mode:', this.config.displayMode);
            this.log('[Divee] Config containerSelector (from server):', this.config.containerSelector);

            // For floating mode, always append to body
            if (this.config.displayMode === 'floating') {
                this.log('[Divee] Floating mode: appending to body (containerSelector ignored)');
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

            // Insert widget
            if (targetElement) {
                this.log('[Divee] Appending widget to:', targetElement);
                targetElement.appendChild(container);
            } else {
                // Final fallback: append to body if nothing found
                this.log('[Divee] No suitable container found, appending to body as fallback');
                document.body.appendChild(container);
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
                self.log('[Divee DEBUG] Setting up 1s timeout for ad display...');
                setTimeout(() => {
                    self.log('[Divee DEBUG] === 1s timeout fired, displaying ads ===');
                    googletag.cmd.push(function () {
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
                        googletag.pubads().addEventListener('slotRenderEnded', function (event) {
                            const slotId = event.slot.getSlotElementId();
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
                }, 1000);
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
            this.log('[Divee DEBUG] Displaying expanded view ads...');
            
            googletag.cmd.push(function () {
                self.log('[Divee DEBUG] Requesting expanded ad display...');
                
                const desktopEl = document.getElementById('div-gpt-ad-expanded-desktop');
                const mobileEl = document.getElementById('div-gpt-ad-expanded-mobile');
                
                if (desktopEl) {
                    googletag.display('div-gpt-ad-expanded-desktop');
                    self.log('[Divee DEBUG] ✓ Display called for expanded desktop ad');
                }
                
                if (mobileEl) {
                    googletag.display('div-gpt-ad-expanded-mobile');
                    self.log('[Divee DEBUG] ✓ Display called for expanded mobile ad');
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
                session_id: this.state.sessionId
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
                content: this.contentCache.content,
                visitor_id: this.state.visitorId,
                session_id: this.state.sessionId,
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

        setupAdClickTracking(adElement, slotId, eventData) {
            const self = this;
            
            // Track clicks on the ad container
            adElement.addEventListener('click', function(e) {
                self.log('[Divee DEBUG] Ad clicked:', slotId);
                
                self.trackEvent('ad_click', {
                    ad_unit: slotId,
                    position: slotId.includes('expanded') ? 'expanded' : 'collapsed',
                    size: eventData.size ? `${eventData.size[0]}x${eventData.size[1]}` : 'unknown',
                    advertiser_id: eventData.advertiserId || null,
                    creative_id: eventData.creativeId || null,
                    line_item_id: eventData.lineItemId || null,
                    click_x: e.clientX,
                    click_y: e.clientY,
                    timestamp: Date.now()
                });
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

        async trackEvent(eventName, data = {}) {
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
            const payload = {
                project_id: projectId,
                visitor_id: visitorId,
                session_id: sessionId,
                event_type: eventName,
                event_label: data.label || null,
                event_data: data
            };
            
            try {
                // Use fetch with keepalive for cross-origin reliability
                const endpoint = `${this.config.apiBaseUrl}/analytics`;
                
                fetch(endpoint, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload),
                    keepalive: true
                }).catch(err => {
                    console.error('[Divee Analytics] Failed to send event:', err);
                });
            } catch (err) {
                console.error('[Divee Analytics] Error tracking event:', err);
            }
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
                apiBaseUrl: "https://srv.divee.ai/functions/v1"
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

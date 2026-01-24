# Divee Widget - Embedding Guide

## Quick Start

Add the following script tag to your HTML page, just before the closing `</body>` tag:

```html
<script src="https://srv.divee.ai/sdk/divee.sdk.latest.js" 
    data-project-id="your-project-id">
</script>
```

Replace `your-project-id` with your actual Divee project ID.

**All widget settings (display mode, position, styling) are now configured in your Divee project dashboard.** This allows you to change widget behavior without updating your website code.

---

## Configuration

### Project Dashboard Settings

Configure your widget behavior in the Divee dashboard under Project Settings:

| Setting | Values | Default | Description |
|---------|--------|---------|-------------|
| **Display Mode** | `anchored` \| `floating` | `anchored` | How the widget is positioned on the page |
| **Display Position** | `bottom-right` \| `bottom-left` | `bottom-right` | Position for floating mode |
| **Article Class** | CSS selector | `.article` | CSS selector to identify article content |
| **Container Class** | CSS selector | (none) | CSS selector for where to insert the widget (anchored mode only) |

### Display Modes

#### Anchored Mode
- Embedded inline within your content
- Shows ads in both collapsed and expanded states
- Flows with page content
- Max width: 800px, centered
- Positioned based on **Container Class** setting or auto-detected

#### Floating Mode
- Fixed position at screen corner
- **No ads in collapsed state** - just a compact button (56px circle on mobile)
- Ads shown only in expanded chat state
- Width: 400px on desktop, full-width on mobile
- Always visible while scrolling
- Position based on **Display Position** setting

---

## Installation Examples

### Basic Installation

The simplest setup - all configuration comes from your dashboard:

```html
<script src="https://srv.divee.ai/sdk/divee.sdk.latest.js" 
    data-project-id="your-project-id">
</script>
```

### With Article Content Detection

If your article has a specific class:

```html
<article class="post-content">
    <h1>Article Title</h1>
    <p>Article content here...</p>
</article>

<script src="https://srv.divee.ai/sdk/divee.sdk.latest.js" 
    data-project-id="your-project-id">
</script>
```

Configure `article_class` as `.post-content` in your project dashboard.

### With Custom Container Placement (Anchored Mode)

```html
<article class="blog-post">
    <h1>Article Title</h1>
    <p>First paragraph...</p>
    
    <!-- Widget will appear here -->
    <div id="ai-assistant-container"></div>
    
    <p>More content...</p>
</article>

<script src="https://srv.divee.ai/sdk/divee.sdk.latest.js" 
    data-project-id="your-project-id">
</script>
```

Configure `widget_container_class` as `#ai-assistant-container` in your project dashboard.

---

## Deprecated: Data Attributes (Backwards Compatibility)

> **⚠️ DEPRECATED:** The following data attributes are deprecated and will be removed in a future version. Configure these settings in your project dashboard instead.

For backwards compatibility, these attributes still work but will show console warnings in debug mode:

| Deprecated Attribute | Use Dashboard Setting Instead |
|---------------------|-------------------------------|
| `data-display-mode` | **Display Mode** |
| `data-floating-position` | **Display Position** |
| `data-article-class` | **Article Class** |
| `data-container-selector` | **Container Class** |

**Migration Path:** Remove these attributes from your script tag and configure them in your Divee dashboard. This allows you to update settings without touching your website code.

---

## Content Extraction

The widget needs to extract your article content to provide context-aware answers. You can help it find the right content:

### Method 1: Using `data-article-class`

Specify the CSS class that wraps your article content:

```html
<article class="post-content">
    <!-- Your article here -->
</article>

<script src="..." 
    data-article-class=".post-content">
</script>
```

### Method 2: Automatic Detection

If you don't specify `data-article-class`, the widget will automatically look for:
1. `<article>` element
2. Elements with `role="article"` attribute
3. `<main>` element
4. Entire `<body>` content (fallback)

### Method 3: Custom Functions

For advanced control, you can define custom functions in your page before loading the widget:

```html
<script>
// Custom function to extract article content
function getContent(articleClass) {
    return document.querySelector('.my-custom-article').textContent;
}

// Custom function to get article title
function getContentTitle() {
    return document.querySelector('h1.article-title').textContent;
}

// Custom function to get article URL
function getContentUrl() {
    return window.location.href;
}
</script>

<script src="https://srv.divee.ai/sdk/divee.sdk.latest.js" 
    data-project-id="your-project-id">
</script>
```

---

## Behavior Differences

### Anchored Mode
- ✅ Shows ads in collapsed state
- ✅ Shows ads in expanded state
- ✅ Flows with page content
- ✅ Can be placed in specific location
- ✅ Max-width: 800px, centered

### Floating Mode
- ❌ No ads in collapsed state (clean button only)
- ✅ Shows ads in expanded state
- ✅ Fixed position, always visible
- ✅ Follows user while scrolling
- ✅ Width: 400px when expanded
- ✅ Auto-shrinks if no ads available

---

## Debug Mode

Enable debug mode to see console logs:

```
https://yoursite.com/article?diveeDebug=true
```

This will show detailed logs about:
- Widget initialization
- Content extraction
- Ad loading
- API requests
- Configuration details

---

## Best Practices

### 1. Choose the Right Mode

**Use Floating Mode when:**
- You want minimal intrusion on page layout
- Your articles are long and users scroll extensively
- You want the widget always accessible
- You prefer a modern chat-bubble interface

**Use Anchored Mode when:**
- You want the widget integrated into your content flow
- You want to control exact placement
- You prefer a more traditional embedded widget
- Your layout has dedicated space for widgets

### 2. Optimize Content Selection

- Always specify `data-article-class` for best accuracy
- Exclude headers, footers, sidebars from the article selector
- Ensure your article class only contains the main content

### 3. Test Before Going Live

- Test both collapsed and expanded states
- Check on mobile and desktop
- Verify ad display behavior
- Test with debug mode enabled

---

## Mobile Responsiveness

The widget is fully responsive:

- **Desktop (>768px):** Shows desktop ad format (728×90 or 650×100)
- **Mobile (≤768px):** Shows mobile ad format (300×250 or 336×280)
- **Floating mode:** Automatically adjusts to screen size
- **Anchored mode:** Max-width adjusts for smaller screens

---

## Troubleshooting

### Widget Not Appearing

1. Check that `data-project-id` is correct
2. Open browser console for errors
3. Enable debug mode: `?diveeDebug=true`
4. Verify the script URL is correct

### Wrong Content Being Extracted

1. Specify `data-article-class` explicitly
2. Check that your article class only wraps main content
3. Use custom `getContent()` function for complex layouts

### Widget Not Floating

1. Verify `data-display-mode="floating"` is set
2. Rebuild/clear cache after code changes
3. Check for CSS conflicts with `position: fixed`

### Ads Not Showing

1. Check your project's ad settings in Divee dashboard
2. Verify ad slots are configured correctly
3. Check browser ad-blockers
4. Review console logs in debug mode

---

## Support

For additional help:
- 📧 Email: support@divee.ai
- 📚 Documentation: https://docs.divee.ai
- 💬 Support Portal: https://support.divee.ai

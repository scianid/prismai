# Divee Widget - Embedding Guide

## Quick Start

Add the following script tag to your HTML page, just before the closing `</body>` tag:

```html
<script src="https://srv.divee.ai/sdk/divee.sdk.latest.js" 
    data-project-id="your-project-id">
</script>
```

Replace `your-project-id` with your actual Divee project ID.

---

## Display Modes

### Anchored Mode (Default)

The widget is embedded inline within your content. This is the default behavior.

```html
<script src="https://srv.divee.ai/sdk/divee.sdk.latest.js" 
    data-project-id="your-project-id"
    data-display-mode="anchored"
    data-container-selector="#widget-container">
</script>
```

**Characteristics:**
- Embedded inline in the article
- Shows ads in both collapsed and expanded states
- Flows with page content
- Max width: 800px, centered

**Positioning Options:**
- Use `data-container-selector` to specify where to insert the widget (e.g., `data-container-selector="#widget-container"`)
- If not specified, automatically inserts at the end of the first `<article>`, `[role="article"]`, or `<main>` element
- Falls back to appending to `<body>` if no suitable container is found

### Floating Mode

The widget appears as a floating button in the corner of the screen.

```html
<script src="https://srv.divee.ai/sdk/divee.sdk.latest.js" 
    data-project-id="your-project-id"
    data-display-mode="floating"
    data-floating-position="bottom-right">
</script>
```

**Characteristics:**
- Fixed position at screen corner
- **No ads in collapsed state** - just a compact button
- Ads shown only in expanded chat state
- Width: 400px when expanded
- Always visible while scrolling

---

## Configuration Options

### Required Attributes

| Attribute | Description | Example |
|-----------|-------------|---------|
| `data-project-id` | Your Divee project ID (required) | `data-project-id="abc-123-xyz"` |

### Display Options

| Attribute | Values | Default | Description |
|-----------|--------|---------|-------------|
| `data-display-mode` | `anchored` \| `floating` | `anchored` | How the widget is positioned on the page |
| `data-floating-position` | `bottom-right` \| `bottom-left` | `bottom-right` | Position for floating mode (only applies when `display-mode="floating"`) |

### Content Selection

| Attribute | Description | Example |
|-----------|-------------|---------|
| `data-article-class` | CSS class selector to identify article content | `data-article-class=".article-content"` |
| `data-container-selector` | CSS selector for where to insert the widget (anchored mode only) | `data-container-selector="#widget-container"` |

> **Note:** `data-container-selector` only applies to anchored mode. In floating mode, the widget is always appended to `<body>`.

### Legacy Options

| Attribute | Values | Default | Description |
|-----------|--------|---------|-------------|
| `data-position` | `top` \| `bottom` | `bottom` | Legacy position setting (use `display-mode` instead) |

---

## Complete Examples

### Example 1: Floating Widget (Bottom-Right)

```html
<!DOCTYPE html>
<html>
<head>
    <title>My Article</title>
</head>
<body>
    <article class="main-article">
        <h1>Article Title</h1>
        <p>Article content here...</p>
    </article>

    <!-- Divee Widget -->
    <script src="https://srv.divee.ai/sdk/divee.sdk.latest.js" 
        data-project-id="your-project-id"
        data-display-mode="floating"
        data-floating-position="bottom-right"
        data-article-class=".main-article">
    </script>
</body>
</html>
```

### Example 2: Floating Widget (Bottom-Left)

```html
<script src="https://srv.divee.ai/sdk/divee.sdk.latest.js" 
    data-project-id="your-project-id"
    data-display-mode="floating"
    data-floating-position="bottom-left"
    data-article-class=".article-content">
</script>
```

### Example 3: Anchored Widget (Inline)

```html
<article class="blog-post">
    <h1>Article Title</h1>
    
    <p>First paragraph...</p>
    
    <!-- Widget will appear here -->
    <div id="ai-assistant-container"></div>
    
    <p>More content...</p>
</article>

<script src="https://srv.divee.ai/sdk/divee.sdk.latest.js" 
    data-project-id="your-project-id"
    data-display-mode="anchored"
    data-container-selector="#ai-assistant-container"
    data-article-class=".blog-post">
</script>
```

### Example 4: Anchored Widget (Auto-Placement)

If you don't specify `data-container-selector`, the widget will automatically insert itself at the end of the first `<article>`, `[role="article"]`, or `<main>` element:

```html
<article>
    <h1>Article Title</h1>
    <p>Content here...</p>
    <!-- Widget will be automatically inserted at the end -->
</article>

<script src="https://srv.divee.ai/sdk/divee.sdk.latest.js" 
    data-project-id="your-project-id"
    data-display-mode="anchored">
</script>
```

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

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

async function build() {
  console.log('Building widget SDK...');

  // 1. Read and minify CSS
  const cssPath = path.join(__dirname, 'src', 'styles.css');
  let cssInjection = '';
  
  if (fs.existsSync(cssPath)) {
    const css = fs.readFileSync(cssPath, 'utf8');
    const minifiedCss = await esbuild.transform(css, { loader: 'css', minify: true });
    
    cssInjection = `
(function() {
  const style = document.createElement('style');
  style.textContent = ${JSON.stringify(minifiedCss.code)};
  document.head.appendChild(style);
})();
`;
  } else {
    console.warn('Warning: src/styles.css not found.');
  }

  // 2. Read JS files
  const contentJsPath = path.join(__dirname, 'src', 'content.js');
  const widgetJsPath = path.join(__dirname, 'src', 'widget.js');

  let contentJs = '';
  if (fs.existsSync(contentJsPath)) {
    contentJs = fs.readFileSync(contentJsPath, 'utf8');
  } else {
    console.warn('Warning: src/content.js not found.');
  }

  let widgetJs = '';
  if (fs.existsSync(widgetJsPath)) {
    widgetJs = fs.readFileSync(widgetJsPath, 'utf8');
  } else {
    console.error('Error: src/widget.js not found.');
    process.exit(1);
  }

  // 3. Combine parts
  // Order: CSS Injection -> content.js (globals) -> widget.js (logic)
  // Wrap everything in an IIFE to prevent global scope pollution
  const combinedJs = `
(function() {
${cssInjection}
${contentJs}
${widgetJs}
})();
`;

  // 4. Minify JS (keep console for debug mode)
  const result = await esbuild.transform(combinedJs, { 
    loader: 'js', 
    minify: true,
    target: 'es2020'  // Modern browsers
  });

  // 5. Write output
  const distDir = path.join(__dirname, 'dist');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir);
  }

  // Generate timestamp (DD-MM-YY-HHMMSS)
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = String(now.getFullYear()).slice(-2);
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const timestamp = `${day}-${month}-${year}-${hours}${minutes}${seconds}`;

  // Write latest version
  const latestPath = path.join(distDir, 'divee.sdk.latest.js');
  fs.writeFileSync(latestPath, result.code);
  console.log(`Build complete: ${latestPath}`);

  // Write timestamped version
  const versionedPath = path.join(distDir, `divee.sdk.${timestamp}.js`);
  fs.writeFileSync(versionedPath, result.code);
  console.log(`Build complete: ${versionedPath}`);
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});

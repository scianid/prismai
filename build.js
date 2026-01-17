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

  // 4. Minify JS
  const result = await esbuild.transform(combinedJs, { loader: 'js', minify: true });

  // 5. Write output
  const distDir = path.join(__dirname, 'dist');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir);
  }

  const outputPath = path.join(distDir, 'divee.sdk.js');
  fs.writeFileSync(outputPath, result.code);
  
  console.log(`Build complete: ${outputPath}`);
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});

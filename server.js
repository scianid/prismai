// WARNING: This is a development-only server. Do NOT expose it on a public
// network or use it in production — it serves local files and has no auth.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

// H-5 fix: project root used for path traversal containment
const PROJECT_ROOT = path.resolve(__dirname);

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  console.log(`${req.method} ${req.url}`);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // API Mock endpoints
  if (req.url.startsWith('/api/')) {
    handleAPI(req, res);
    return;
  }

  // Static file serving
  // Remove query string and decode percent-encoding before resolving
  const urlPath = req.url.split('?')[0];
  let filePath = path.resolve(PROJECT_ROOT, '.' + urlPath);
  if (urlPath === '/') {
    filePath = path.resolve(PROJECT_ROOT, 'test/index.html');
  }

  // H-5 fix: reject any path that escapes the project root (path traversal guard)
  if (!filePath.startsWith(PROJECT_ROOT + path.sep) && filePath !== PROJECT_ROOT) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  const extname = String(path.extname(filePath)).toLowerCase();
  const contentType = MIME_TYPES[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 Not Found</h1>', 'utf-8');
      } else {
        res.writeHead(500);
        res.end('Server Error: ' + error.code, 'utf-8');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

function handleAPI(req, res) {
  // Mock API for suggestions
  if (req.url === '/api/v1/suggestions' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        console.log('Suggestions request:', {
          project_id: data.project_id,
          title: data.article_title?.substring(0, 50) + '...',
          content_length: data.article_content?.length
        });

        // Simulate processing delay
        setTimeout(() => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            suggestions: [
              '📝 Summarize this article in 3 key points',
              '🤔 What are the main arguments presented?',
              '🔍 What are the practical implications?'
            ],
            generated_at: new Date().toISOString()
          }));
        }, 600);
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // Mock API for asking questions
  if (req.url === '/api/v1/ask' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        console.log('Ask request:', {
          question: data.question,
          stream: data.stream
        });

        if (data.stream) {
          // Server-Sent Events for streaming
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
          });

          const response = `Based on the article, here's a detailed answer to your question "${data.question}":\n\n1. Interactive content significantly increases reader engagement.\n\n2. Publishers benefit from keeping readers on-site.\n\n3. First-party data from questions provides valuable insights.`;
          
          let index = 0;
          const interval = setInterval(() => {
            if (index < response.length) {
              const chunk = response.substring(index, index + 5);
              res.write(`data: ${JSON.stringify({ type: 'token', content: chunk })}\n\n`);
              index += 5;
            } else {
              res.write(`data: ${JSON.stringify({ type: 'complete' })}\n\n`);
              res.end();
              clearInterval(interval);
            }
          }, 50);
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            answer: 'This is a non-streaming response to your question.',
            citations: [1, 3, 5]
          }));
        }
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // Mock API for config
  if (req.url.startsWith('/api/v1/config') && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      project_id: 'proj_demo_123456',
      branding: {
        site_icon: '🌐',
        site_name: 'TechNews Daily',
        primary_color: '#FF6B35'
      },
      language: 'en',
      theme: 'light',
      features: {
        suggested_reads: true,
        citations: true,
        ads_enabled: true
      }
    }));
    return;
  }

  // 404 for unknown API routes
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'API endpoint not found' }));
}

server.listen(PORT, () => {
  console.log('\n🚀 PrismAI Development Server');
  console.log('================================');
  console.log(`Server running at http://localhost:${PORT}/`);
  console.log(`\nTest pages:`);
  console.log(`  - http://localhost:${PORT}/test/index.html`);
  console.log(`\nAPI endpoints:`);
  console.log(`  - POST /api/v1/suggestions`);
  console.log(`  - POST /api/v1/ask`);
  console.log(`  - GET /api/v1/config`);
  console.log('\nPress Ctrl+C to stop\n');
});

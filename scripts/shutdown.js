#!/usr/bin/env node
/**
 * Graceful server shutdown & maintenance announcer.
 * Usage:
 *   node scripts/shutdown.js [minutes] [reason]
 *   node scripts/shutdown.js 3 "Updating server to 0.1.4"
 *   node scripts/shutdown.js now
 *   node scripts/shutdown.js cancel
 */

const http = require('http');

const arg = process.argv[2] || '3';
let cancel = false;
let minutes = 3;
let reason = process.argv[3] || 'Server update';

if (arg === 'cancel') {
  cancel = true;
} else if (arg === 'now' || arg === '0') {
  minutes = 0;
} else {
  const parsed = parseFloat(arg);
  if (!isNaN(parsed)) {
    minutes = parsed;
  }
}

const payload = JSON.stringify({
  minutes,
  cancel,
  reason,
});

const req = http.request({
  hostname: '127.0.0.1',
  port: 8124,
  path: '/api/admin/shutdown',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  },
}, (res) => {
  let body = '';
  res.on('data', chunk => { body += chunk; });
  res.on('end', () => {
    try {
      const data = JSON.parse(body);
      if (data.ok) {
        if (cancel) {
          console.log('✅ Server shutdown broadcast has been CANCELLED.');
        } else if (minutes === 0) {
          console.log('✅ Server shutting down immediately.');
        } else {
          console.log(`✅ Server shutdown initiated: ${minutes} minute(s) warning broadcasted to all connected players.`);
        }
      } else {
        console.error('❌ Server returned error:', data.error || body);
        process.exit(1);
      }
    } catch (e) {
      console.log('Response:', body);
    }
  });
});

req.on('error', (err) => {
  console.error(`❌ Could not connect to Dagyr Online server on 127.0.0.1:8124: ${err.message}`);
  process.exit(1);
});

req.write(payload);
req.end();


import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const app = express();
const PORT = process.env.PORT || 3000;

// Resolve static path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// In-memory session store
// key: UPPERCASE PIN (e.g., A123456)
// value: { text: String, expiresAt: Number }
const sessions = new Map();

// Helper to validate and normalize PIN format (1 Letter, 6 Digits)
const parseAndValidatePin = (pinStr) => {
  if (!pinStr) return null;
  const cleaned = pinStr.trim().toUpperCase();
  const pinRegex = /^[A-Z]\d{6}$/;
  if (pinRegex.test(cleaned)) {
    return cleaned;
  }
  return null;
};

// Periodic cleanup of expired sessions (runs every 10 seconds)
setInterval(() => {
  const now = Date.now();
  for (const [pin, session] of sessions.entries()) {
    if (session.expiresAt <= now) {
      sessions.delete(pin);
      console.log(`[EXPIRED] Session ${pin} deleted.`);
    }
  }
}, 10000);

// Endpoint: Check or Create Session
app.post('/api/session/:pin', (req, res) => {
  const pin = parseAndValidatePin(req.params.pin);
  if (!pin) {
    return res.status(400).json({ error: 'වැරදි PIN ආකෘතියකි. (උදා: A123456)' });
  }

  const now = Date.now();
  const session = sessions.get(pin);

  // If session exists and hasn't expired
  if (session && session.expiresAt > now) {
    return res.json({
      status: 'existing',
      expiresAt: session.expiresAt,
      message: 'පවතින සටහනට සාර්ථකව සම්බන්ධ විය.'
    });
  }

  // If session expired, delete it first
  if (session) {
    sessions.delete(pin);
  }

  // Create new session
  const expiresAt = now + 15 * 60 * 1000; // 15 minutes
  sessions.set(pin, {
    text: '',
    expiresAt
  });

  console.log(`[CREATED] New session ${pin} created. Expires at ${new Date(expiresAt).toLocaleTimeString()}`);
  
  res.json({
    status: 'created',
    expiresAt,
    message: 'නව සටහනක් සාර්ථකව නිර්මාණය විය.'
  });
});

// Endpoint: Get Session Data
app.get('/api/session/:pin', (req, res) => {
  const pin = parseAndValidatePin(req.params.pin);
  if (!pin) {
    return res.status(400).json({ error: 'වැරදි PIN ආකෘතියකි.' });
  }

  const now = Date.now();
  const session = sessions.get(pin);

  if (!session) {
    return res.status(404).json({ error: 'මෙම PIN එක සහිත සටහනක් හමු නොවීය.' });
  }

  if (session.expiresAt <= now) {
    sessions.delete(pin);
    return res.status(404).json({ error: 'මෙම සටහනෙහි කාලය අවසන් වී ඇත.' });
  }

  res.json({
    text: session.text,
    expiresAt: session.expiresAt
  });
});

// Endpoint: Update Session Data
app.put('/api/session/:pin', (req, res) => {
  const pin = parseAndValidatePin(req.params.pin);
  if (!pin) {
    return res.status(400).json({ error: 'වැරදි PIN ආකෘතියකි.' });
  }

  const now = Date.now();
  const session = sessions.get(pin);

  if (!session) {
    return res.status(404).json({ error: 'සටහනක් හමු නොවීය.' });
  }

  if (session.expiresAt <= now) {
    sessions.delete(pin);
    return res.status(404).json({ error: 'මෙම සටහනෙහි කාලය අවසන් වී ඇත.' });
  }

  session.text = req.body.text || '';
  res.json({
    success: true,
    expiresAt: session.expiresAt
  });
});

// Endpoint: Destroy Session Immediately
app.delete('/api/session/:pin', (req, res) => {
  const pin = parseAndValidatePin(req.params.pin);
  if (!pin) {
    return res.status(400).json({ error: 'වැරදි PIN ආකෘතියකි.' });
  }

  if (sessions.has(pin)) {
    sessions.delete(pin);
    console.log(`[DESTROYED] Session ${pin} manually destroyed.`);
    return res.json({ success: true, message: 'සටහන සාර්ථකව විනාශ කරන ලදී.' });
  }

  res.status(404).json({ error: 'සටහනක් හමු නොවීය.' });
});

// Start express server
app.listen(PORT, '0.0.0.0', () => {
  console.log('====================================================');
  console.log(`TempShare Server is running on:`);
  console.log(`  - Local:           http://localhost:${PORT}`);
  
  // Print all network IPv4 interfaces for mobile login
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log(`  - Mobile Network:  http://${iface.address}:${PORT}`);
      }
    }
  }
  console.log('====================================================');
});

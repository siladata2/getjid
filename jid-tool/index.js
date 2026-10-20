const express = require('express');
const p = require('pino');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let sock;
let isReady = false;

async function startSocket() {
  const { state, saveCreds } = await useMultiFileAuthState('./jid-session');
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: p({ level: 'silent' }),
    browser: ["JID Tool", "Chrome", "1.0"]
  });

  sock.ev.on('creds.update', saveCreds);
  
  sock.ev.on('connection.update', ({ connection }) => {
    if (connection === 'open') {
      isReady = true;
      console.log('[ JID TOOL ] Connected');
    }
    if (connection === 'close') {
      isReady = false;
      console.log('[ JID TOOL ] Disconnected, reconnecting...');
      setTimeout(startSocket, 3000);
    }
  });
}

startSocket();

// API - HII NDIO FUNCTION PEKEE
app.post('/api/convert', async (req, res) => {
  try {
    if (!isReady) return res.status(400).json({ success: false, error: 'Service not ready, scan QR first' });
    
    let { link } = req.body;
    if (!link) return res.status(400).json({ success: false, error: 'Link required' });

    let inviteCode = link.trim();
    const match = inviteCode.match(/channel\/([A-Za-z0-9]+)/);
    if (match) inviteCode = match[1];

    if (inviteCode.includes('@newsletter')) {
      return res.json({ success: true, jid: inviteCode, invite: inviteCode, name: 'Direct JID' });
    }

    let info;
    try {
      info = await sock.newsletterMetadata('invite', inviteCode);
    } catch {
      info = await sock.newsletterFetchInviteInfo(inviteCode);
    }

    res.json({
      success: true,
      jid: info.id || info.jid,
      name: info.name,
      followers: info.subscribers || 0,
      invite: inviteCode,
      verified: info.verified || false
    });

  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/status', (req, res) => {
  res.json({ ready: isReady });
});

const PORT = 4000;
app.listen(PORT, () => console.log(`[ JID TOOL ] Running http://localhost:${PORT}`));
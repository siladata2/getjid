const express = require('express');
const cors = require('cors');
const p = require('pino');
const path = require('path');
const fs = require('fs');
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const QR = require('qrcode-terminal');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

let sock;
let isConnected = false;
let qrCodeText = null;
let commands = new Map();

// ==================== LOAD COMMANDS ====================
function loadCommands() {
  const cmdPath = path.join(__dirname, 'silatech');
  if (!fs.existsSync(cmdPath)) fs.mkdirSync(cmdPath, { recursive: true });
  
  const files = fs.readdirSync(cmdPath).filter(f => f.endsWith('.js'));
  commands.clear();
  
  for (let file of files) {
    try {
      delete require.cache[require.resolve(path.join(cmdPath, file))];
      const cmd = require(path.join(cmdPath, file));
      if (cmd.name) {
        commands.set(cmd.name.toLowerCase(), cmd);
        if (cmd.alias && Array.isArray(cmd.alias)) {
          cmd.alias.forEach(a => commands.set(a.toLowerCase(), cmd));
        }
        console.log(`✅ Loaded: ${cmd.name}`);
      }
    } catch (e) {
      console.log(`❌ Failed ${file}: ${e.message}`);
    }
  }
  console.log(`📦 Total Commands: ${new Set([...commands.values()]).size}`);
}

// ==================== START BOT ====================
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./session');
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: p({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ["Sila Tech", "Chrome", "1.0"]
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, qr } = update;
    if (qr) {
      qrCodeText = qr;
      QR.generate(qr, { small: true });
      console.log('📱 QR Generated - Go to /qr');
    }
    if (connection === 'open') {
      isConnected = true;
      qrCodeText = null;
      console.log('✅ Bot Connected - Sila Tech');
      loadCommands();
      
      // Watch folder for new commands
      try {
        fs.watch(path.join(__dirname, 'silatech'), () => {
          console.log('🔄 Reloading commands...');
          loadCommands();
        });
      } catch {}
    }
    if (connection === 'close') {
      isConnected = false;
      console.log('❌ Disconnected, reconnecting...');
      setTimeout(() => startBot(), 3000);
    }
  });

  // ==================== MESSAGE HANDLER ====================
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const m = messages[0];
    if (!m.message || m.key.fromMe) return;
    
    const from = m.key.remoteJid;
    const text = m.message.conversation || m.message.extendedTextMessage?.text || m.message.imageMessage?.caption || "";
    
    if (!text.startsWith('.')) return;

    const args = text.slice(1).trim().split(/ +/);
    const cmdName = args.shift().toLowerCase();
    
    const cmd = commands.get(cmdName);
    if (!cmd) return;

    try {
      console.log(`📩 Command: .${cmdName} from ${from}`);
      await cmd.execute(sock, m, args, from, commands);
    } catch (e) {
      console.error(e);
      await sock.sendMessage(from, { text: `❌ Error: ${e.message}` });
    }
  });

  return sock;
}

startBot();

// ==================== API ROUTES ====================

// Status
app.get('/api/status', (req, res) => {
  res.json({ 
    connected: isConnected, 
    hasQR: !!qrCodeText,
    totalCommands: new Set([...commands.values()]).size
  });
});

// QR
app.get('/api/qr', (req, res) => {
  res.json({ qr: qrCodeText, connected: isConnected });
});

// PAIRING CODE - QR + Pairing zote mbili
app.post('/api/pairing', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ success: false, error: 'Weka namba ya simu' });
    
    if (!sock) await startBot();
    
    await new Promise(r => setTimeout(r, 1500));
    
    let cleanPhone = phone.replace(/[^0-9]/g, '');
    const code = await sock.requestPairingCode(cleanPhone);
    
    console.log(`🔑 Pairing Code for ${cleanPhone}: ${code}`);
    res.json({ success: true, code: code, phone: cleanPhone });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// CHANNEL REACT
app.post('/api/react', async (req, res) => {
  try {
    if (!isConnected) return res.status(400).json({ success: false, error: 'Bot haijaunganishwa, nenda /qr kwanza' });
    
    const { link, emojis, count } = req.body;
    if (!link || !emojis || emojis.length === 0) {
      return res.status(400).json({ success: false, error: 'Weka link na chagua emoji' });
    }

    let inviteCode = link.split('/').pop().split('?')[0];
    const match = link.match(/channel\/([A-Za-z0-9]+)/);
    if (match) inviteCode = match[1];

    console.log(`🔍 Fetching channel: ${inviteCode}`);
    const channelInfo = await sock.newsletterFetchInviteInfo(inviteCode);
    const channelJid = channelInfo.id;
    
    const messages = await sock.newsletterFetchMessages(channelJid, 1);
    if (!messages || messages.length === 0) {
      return res.status(404).json({ success: false, error: 'Hakuna post kwenye channel' });
    }
    const lastMessageId = messages[0].key.id;

    let sent = 0;
    const totalReact = parseInt(count) || emojis.length;

    for (let i = 0; i < totalReact; i++) {
      const emoji = emojis[i % emojis.length];
      try {
        await sock.newsletterReactMessage(channelJid, lastMessageId, emoji);
        sent++;
        await new Promise(r => setTimeout(r, 1200));
      } catch (e) {
        console.log(`Error ${emoji}: ${e.message}`);
      }
    }

    res.json({ success: true, channel: channelInfo.name, reacted: sent, messageId: lastMessageId });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Pages
app.get('/qr', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'qr.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ====== API YA JID WEBSITE ======
app.post('/api/getjid', async (req, res) => {
  try {
    if (!isConnected) return res.status(400).json({ success: false, error: 'Bot haijaunganishwa' });
    
    const { link } = req.body;
    if (!link) return res.status(400).json({ success: false, error: 'Weka link' });

    let inviteCode = link.trim();
    const match = inviteCode.match(/channel\/([A-Za-z0-9]+)/);
    if (match) inviteCode = match[1];

    if (inviteCode.includes('@newsletter')) {
      return res.json({ success: true, jid: inviteCode, name: 'Direct JID', invite: inviteCode });
    }

    let info;
    try {
      info = await sock.newsletterMetadata('invite', inviteCode);
    } catch {
      info = await sock.newsletterFetchInviteInfo(inviteCode);
    }

    const jid = info.id || info.jid;
    const name = info.name || 'Unknown';
    const followers = info.subscribers || 0;

    res.json({ success: true, jid, name, followers, invite: inviteCode });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/jid', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'jid.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Sila Tech Server: http://localhost:${PORT}`));
const fs = require('fs');
const path = require('path');
const express = require('express');
const QRCode = require('qrcode');
const Jimp = require('jimp');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');

const app = express();
const PORT = process.env.PORT || 10000;
const TARGET_DATE = new Date('2027-01-22T00:00:00+05:30');
const GROUP_JID = process.env.GROUP_JID || '120363411370862499@g.us';

let sock = null;
let qrCodeData = null;
let isConnected = false;

function getDaysLeft() {
  const now = new Date();
  const target = new Date(TARGET_DATE);
  const diff = target - now;
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  return Math.max(0, days);
}

async function generateColoredDP(days) {
  const size = 640;
  const image = new Jimp(size, size, '#0A1931');
  const blueCircle = new Jimp(size - 100, size - 100, '#185ADB');
  blueCircle.circle();
  image.composite(blueCircle, 50, 50);
  const yellow = new Jimp(200, 200, '#FFC947');
  yellow.circle();
  image.composite(yellow, 430, 20);
  const fontBig = await Jimp.loadFont(Jimp.FONT_SANS_128_WHITE);
  const fontMed = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
  const fontSmall = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
  image.print(fontBig, 0, 140, { text: `${days}`, alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, size, size);
  image.print(fontMed, 0, 300, { text: 'DAYS LEFT', alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, size, size);
  image.print(fontSmall, 0, 400, { text: 'JEE 2027', alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, size, size);
  return await image.getBufferAsync(Jimp.MIME_JPEG);
}

async function updateGroupDP() {
  if (!sock ||!isConnected) return;
  try {
    const days = getDaysLeft();
    const buffer = await generateColoredDP(days);
    await sock.updateProfilePicture(GROUP_JID, buffer);
    console.log(`✅ DP UPDATED - ${days} days`);
    try {
      await sock.groupUpdateSubject(GROUP_JID, `JEE 2027 - ${days} Days Left 🔥`);
      console.log(`✅ Name updated`);
    } catch (e) { console.log('Name needs admin:', e.message); }
  } catch (e) { console.log('DP error:', e.message); }
}

function scheduleMidnightUpdate() {
  const now = new Date();
  const nowIST = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const nextMidnight = new Date(nowIST);
  nextMidnight.setHours(24, 0, 5, 0);
  const msToMidnight = nextMidnight - nowIST;
  console.log(`Next midnight update in ${Math.round(msToMidnight / 1000 / 60)} mins`);
  setTimeout(() => {
    updateGroupDP();
    setInterval(updateGroupDP, 24 * 60 * 60 * 1000);
  }, msToMidnight);
}

if (process.env.SESSION_BASE64) {
  try {
    if (!fs.existsSync('auth_info')) fs.mkdirSync('auth_info', { recursive: true });
    const data = JSON.parse(Buffer.from(process.env.SESSION_BASE64, 'base64').toString());
    for (const f in data) fs.writeFileSync(path.join('auth_info', f), data[f]);
    console.log('Session restored from ENV');
  } catch (e) { console.log('ENV restore failed', e.message); }
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const { version } = await fetchLatestBaileysVersion();
  sock = makeWASocket({ version, auth: state, printQRInTerminal: false, browser: ['JEE Bot', 'Chrome', '1.0'] });
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) { qrCodeData = qr; isConnected = false; console.log('QR generated'); }
    if (connection === 'open') {
      qrCodeData = null; isConnected = true;
      console.log('Bot Connected!');
      await updateGroupDP();
      scheduleMidnightUpdate();
    }
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      isConnected = false;
      console.log('Closed:', statusCode);
      if (statusCode === DisconnectReason.loggedOut) {
        try { fs.rmSync('auth_info', { recursive: true, force: true }); } catch {}
        qrCodeData = null;
      }
      if (statusCode!== DisconnectReason.loggedOut) setTimeout(startBot, 3000);
    }
  });

  // --- AUTO OFF Disappearing Messages ---
  sock.ev.on('groups.update', async (updates) => {
    for (const update of updates) {
      if (update.id === GROUP_JID && update.ephemeralDuration && update.ephemeralDuration > 0) {
        console.log(`Disappearing ON detected (${update.ephemeralDuration}s) - turning OFF`);
        try {
          await sock.groupToggleEphemeral(GROUP_JID, 0);
          console.log('✅ Auto OFF done');
          await sock.sendMessage(GROUP_JID, { text: '⚠️ Disappearing messages was turned ON. I turned it OFF automatically to keep countdown safe.' });
        } catch (e) { console.log('Failed to OFF disappearing:', e.message); }
      }
    }
  });
}

startBot();

app.get('/', async (req, res) => {
  if (req.query.reset === '1') {
    try { fs.rmSync('auth_info', { recursive: true, force: true }); } catch {}
    qrCodeData = null; isConnected = false;
    res.send('Auth wiped! <a href="/">Back</a> - QR in 5 sec');
    setTimeout(() => startBot(), 1000);
    return;
  }
  if (isConnected) {
    const days = getDaysLeft();
    res.send(`<h1>✅ Connected - ${days} Days Left</h1><p>Colored DP + Midnight Auto + Anti-Disappearing Active</p><a href="/force-update"><button>Force Update</button></a><br><br><a href="/get-session">Get SESSION_BASE64</a> | <a href="/?reset=1" style="color:red">Reset QR</a>`);
  } else if (qrCodeData) {
    const qrImg = await QRCode.toDataURL(qrCodeData);
    res.send(`<h2>Scan QR - ${getDaysLeft()} Days Left</h2><img src="${qrImg}" width="300"><script>setTimeout(()=>location.reload(),30000)</script>`);
  } else {
    res.send('<h2>Starting... refresh 3 sec</h2><script>setTimeout(()=>location.reload(),3000)</script>');
  }
});

app.get('/force-update', async (req, res) => { await updateGroupDP(); res.send(`Forced! ${getDaysLeft()} days. <a href="/">Back</a>`); });
app.get('/get-session', (req, res) => {
  try {
    if (!fs.existsSync('auth_info')) return res.send('No auth yet - scan first');
    const files = fs.readdirSync('auth_info');
    const data = {}; files.forEach(f => { data[f] = fs.readFileSync(path.join('auth_info', f), 'utf-8'); });
    const b64 = Buffer.from(JSON.stringify(data)).toString('base64');
    res.send(`<textarea style="width:100%;height:300px">${b64}</textarea><p>Copy to ENV SESSION_BASE64</p>`);
  } catch (e) { res.send('Error: ' + e.message); }
});

app.listen(PORT, () => console.log('Server on ' + PORT));

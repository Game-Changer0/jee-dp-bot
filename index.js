const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const express = require('express');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const Jimp = require('jimp');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 10000;
const AUTH_FOLDER = './auth_info';

// Restore session from ENV
if (process.env.SESSION_BASE64) {
  try {
    if (!fs.existsSync(AUTH_FOLDER)) fs.mkdirSync(AUTH_FOLDER, { recursive: true });
    const files = JSON.parse(Buffer.from(process.env.SESSION_BASE64, 'base64').toString());
    for (const f in files) fs.writeFileSync(path.join(AUTH_FOLDER, f), files[f], 'utf8');
    console.log('Session restored from ENV');
  } catch(e){ console.log('ENV restore fail', e.message); }
}

let sock, qrString=null, isConnected=false;

function getDaysLeft(){
  const jee = new Date('2027-01-24T00:00:00+05:30');
  return Math.max(0, Math.ceil((jee - new Date())/(1000*60*60*24)));
}

async function generateDP(){
  const days = getDaysLeft();
  const img = new Jimp(500,500);
  for(let y=0;y<500;y++){
    for(let x=0;x<500;x++){
      const r = Math.floor(255 - x*0.3);
      const g = Math.floor(50 + y*0.4);
      const b = Math.floor(150 + x*0.2);
      img.setPixelColor(Jimp.rgbaToInt(r,g,b,255), x, y);
    }
  }
  const box = new Jimp(440,440, 0xffffffE6);
  img.composite(box,30,30);
  const blackFontBig = await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK);
  const blackFontMid = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
  const whiteFontSmall = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
  img.print(blackFontBig, 0, 140, {text: `${days}`, alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER}, 500, 100);
  img.print(blackFontMid, 0, 230, {text: 'DAYS LEFT', alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER}, 500, 50);
  img.print(blackFontMid, 0, 280, {text: 'JEE 2027', alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER}, 500, 50);
  return await img.getBufferAsync(Jimp.MIME_PNG);
}

async function updateGroupDP(){
  if(!sock ||!isConnected){ console.log('Skip DP update - not connected'); return; }
  try{
    const buffer = await generateDP();
    const groups = await sock.groupFetchAllParticipating();
    console.log(`Updating DP for ${Object.keys(groups).length} groups to ${getDaysLeft()} days`);
    for(const id in groups){
      try{
        await sock.updateProfilePicture(id, buffer);
        console.log(`✅ DP UPDATED ${id}`);
        await new Promise(r=>setTimeout(r,3000));
      }catch(e){ console.log(`DP fail ${id}:`, e.message); }
    }
  }catch(e){ console.log('DP Error', e.message); }
}

async function checkAndTurnOffDisappearing(){
  if(!sock ||!isConnected) return;
  try{
    const groups = await sock.groupFetchAllParticipating();
    for(const id in groups){
      const meta = groups[id];
      if(meta.ephemeralDuration && meta.ephemeralDuration!==0){
        console.log(`[POLL] Disappearing ON in ${id} - turning OFF`);
        await sock.groupToggleEphemeral(id, 0);
        await sock.sendMessage(id, { text: `⚠️ Disappearing messages was ON — turned OFF automatically.` });
        console.log(`✅ [POLL] OFF in ${id}`);
      }
    }
  }catch(e){ console.log('Poll error', e.message); }
}

async function startBot(){
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
  const { version } = await fetchLatestBaileysVersion();
  sock = makeWASocket({ version, auth: state, printQRInTerminal:false, browser:['JEE Bot','Chrome','1.0'] });
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', async (u)=>{
    const { connection, lastDisconnect, qr } = u;
    if(qr) qrString=qr;
    if(connection==='close'){
      const reconnect = lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut;
      isConnected=false;
      console.log('Closed, reconnect', reconnect);
      if(reconnect) startBot();
    } else if(connection==='open'){
      isConnected=true; qrString=null;
      console.log('✅ Bot Connected!');
      await updateGroupDP();
      // Start 20 sec checker
      setInterval(checkAndTurnOffDisappearing, 20000);
      setTimeout(checkAndTurnOffDisappearing, 10000);
    }
  });

  sock.ev.on('groups.update', async (updates)=>{
    for(const upd of updates){
      try{
        if(upd.ephemeralDuration!== undefined && upd.ephemeralDuration!== 0){
          console.log(`[EVENT] Disappearing ON in ${upd.id}`);
          await new Promise(r=>setTimeout(r,2000));
          await sock.groupToggleEphemeral(upd.id, 0);
          const author = upd.author? upd.author.split('@')[0] : 'Someone';
          await sock.sendMessage(upd.id, { text: `⚠️ Disappearing messages turned ON by @${author} — turned OFF automatically.`, mentions: upd.author? [upd.author] : [] });
        }
      }catch(e){ console.log('ephemeral error', e.message); }
    }
  });
}

// CRON - Midnight IST exact
cron.schedule('0 0 * * *', async ()=>{
  console.log('🕛 Midnight IST - Updating DP');
  await updateGroupDP();
}, { timezone: 'Asia/Kolkata' });

// Keep alive log every minute (helps UptimeRobot see active)
cron.schedule('* * * * *', ()=>{
  const now = new Date().toLocaleString('en-IN', {timeZone:'Asia/Kolkata'});
  console.log(`Tick ${now} - ${getDaysLeft()} days left - Connected: ${isConnected}`);
});

app.get('/', async (req,res)=>{
  if(isConnected) res.send(`<h1>✅ Connected - ${getDaysLeft()} Days Left</h1><p><a href="/get-session">Get Session</a> | <a href="/update-dp-now">Update DP Now</a></p>`);
  else if(qrString){ const qrImg = await QRCode.toDataURL(qrString); res.send(`<h1>Scan QR</h1><img src="${qrImg}" width="300"><script>setTimeout(()=>location.reload(),10000)</script>`); }
  else res.send('<h1>Starting... Refresh 5s</h1><script>setTimeout(()=>location.reload(),5000)</script>');
});

app.get('/get-session', (req,res)=>{
  try{
    if(!fs.existsSync(AUTH_FOLDER)) return res.send('Scan first');
    const files={}; fs.readdirSync(AUTH_FOLDER).forEach(f=> files[f]=fs.readFileSync(path.join(AUTH_FOLDER,f),'utf8'));
    const b64 = Buffer.from(JSON.stringify(files)).toString('base64');
    res.send(`<h2>Copy this to SESSION_BASE64</h2><textarea style="width:100%;height:400px">${b64}</textarea>`);
  }catch(e){ res.send('Error '+e.message); }
});

app.get('/update-dp-now', async (req,res)=>{
  console.log('Manual DP update triggered');
  await updateGroupDP();
  res.send(`✅ DP Updated to ${getDaysLeft()} days left. Check WhatsApp group.`);
});

app.get('/ping', (req,res)=> res.send('pong - bot alive'));

app.listen(PORT, ()=>console.log('Server on',PORT));
startBot();

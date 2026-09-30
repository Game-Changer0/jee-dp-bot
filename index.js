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

if (process.env.SESSION_BASE64) {
  try {
    if (!fs.existsSync(AUTH_FOLDER)) fs.mkdirSync(AUTH_FOLDER, { recursive: true });
    const files = JSON.parse(Buffer.from(process.env.SESSION_BASE64, 'base64').toString());
    for (const f in files) fs.writeFileSync(path.join(AUTH_FOLDER, f), files[f], 'utf8');
    console.log('Session restored');
  } catch(e){}
}

let sock, qrString=null, isConnected=false;
let lastDPUpdateDate = null;

function getDaysLeft(){
  const jee = new Date('2027-01-22T00:00:00+05:30');
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
  const blackBig = await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK);
  const blackMid = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
  img.print(blackBig, 0, 140, {text: `${days}`, alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER}, 500, 100);
  img.print(blackMid, 0, 230, {text: 'DAYS LEFT', alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER}, 500, 50);
  img.print(blackMid, 0, 280, {text: 'JEE 2027', alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER}, 500, 50);
  return await img.getBufferAsync(Jimp.MIME_PNG);
}

async function updateGroupDP(){
  if(!sock ||!isConnected) return;
  try{
    console.log(`DP Update to ${getDaysLeft()} days...`);
    const buffer = await generateDP();
    const groups = await sock.groupFetchAllParticipating();
    for(const id in groups){
      try{
        await sock.updateProfilePicture(id, buffer);
        console.log(`✅ DP UPDATED ${id}`);
        await new Promise(r=>setTimeout(r,5000));
      }catch(e){ console.log(`DP fail ${id}: ${e.message}`); }
    }
    lastDPUpdateDate = new Date().toLocaleDateString('en-IN', {timeZone:'Asia/Kolkata'});
  }catch(e){ console.log('DP Error', e.message); }
}

async function checkAndTurnOffDisappearing(){
  if(!sock ||!isConnected) return;
  try{
    const groups = await sock.groupFetchAllParticipating();
    for(const id in groups){
      if(groups[id].ephemeralDuration && groups[id].ephemeralDuration!==0){
        console.log(`[POLL] ON in ${id} - OFF`);
        await sock.groupToggleEphemeral(id, 0);
        await new Promise(r=>setTimeout(r,2000));
      }
    }
  }catch(e){}
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
      if(reconnect) startBot();
    } else if(connection==='open'){
      isConnected=true; qrString=null;
      console.log('✅ Connected! Days:', getDaysLeft());
      const today = new Date().toLocaleDateString('en-IN', {timeZone:'Asia/Kolkata'});
      if(lastDPUpdateDate!== today){
        setTimeout(updateGroupDP, 10000);
      }
      setInterval(checkAndTurnOffDisappearing, 120000);
      setTimeout(checkAndTurnOffDisappearing, 15000);
    }
  });
  sock.ev.on('groups.update', async (updates)=>{
    for(const upd of updates){
      if(upd.ephemeralDuration!== undefined && upd.ephemeralDuration!== 0){
        try{
          await sock.groupToggleEphemeral(upd.id, 0);
          console.log(`✅ OFF via event ${upd.id}`);
        }catch{}
      }
    }
  });
}

cron.schedule('0 0 * * *', async ()=>{
  console.log('Midnight IST - updating DP');
  await updateGroupDP();
}, { timezone: 'Asia/Kolkata' });

app.get('/', async (req,res)=>{
  if(isConnected) res.send(`<h1>✅ ${getDaysLeft()} Days Left (JEE Jan 22)</h1><p><a href="/update-dp-now">Update DP Now</a> | <a href="/get-session">Get Session</a></p>`);
  else if(qrString){ const qrImg = await QRCode.toDataURL(qrString); res.send(`<h1>Scan QR</h1><img src="${qrImg}" width="300">`); }
  else res.send('<h1>Starting...</h1>');
});

app.get('/get-session', (req,res)=>{
  try{
    if(!fs.existsSync(AUTH_FOLDER)) return res.send('No session');
    const files={}; fs.readdirSync(AUTH_FOLDER).forEach(f=> files[f]=fs.readFileSync(path.join(AUTH_FOLDER,f),'utf8'));
    res.send(`<textarea style="width:100%;height:400px">${Buffer.from(JSON.stringify(files)).toString('base64')}</textarea>`);
  }catch(e){ res.send(e.message); }
});

app.get('/update-dp-now', async (req,res)=>{
  await updateGroupDP();
  res.send(`✅ Updated to ${getDaysLeft()} days (Jan 22)`);
});

app.get('/ping', (req,res)=> res.send('pong'));
app.listen(PORT, ()=>console.log('Server on',PORT));
startBot();

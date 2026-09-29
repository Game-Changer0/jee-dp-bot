const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { createCanvas } = require('canvas');
const qrcode2 = require('qrcode');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

let latestQR = '';
let sockRef = null;
const GROUP_ID = '120599025434049026@g.us';
const EXAM_DATE = new Date('2027-01-24T00:00:00+05:30');

function getDaysLeft(){ return Math.ceil((EXAM_DATE - new Date()) / (1000*60*60*24)); }

async function generateImage(days){
  const canvas = createCanvas(800, 800);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0f0f0f'; ctx.fillRect(0,0,800,800);
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 120px Arial'; ctx.textAlign='center'; ctx.fillText(days,400,320);
  ctx.font = 'bold 36px Arial'; ctx.fillText('DAYS LEFT',400,380);
  return canvas.toBuffer('image/jpeg');
}

async function updateDP(sock){
  try{
    const days = getDaysLeft();
    const img = await generateImage(days);
    console.log(`Trying to update DP for ${GROUP_ID}...`);
    await sock.groupUpdateSubject(GROUP_ID, `Academic Allies | ${days} Days Left`);
    console.log('Subject updated, now DP...');
    await sock.updateProfilePicture(GROUP_ID, img);
    console.log(`✅ DP UPDATED: ${days} days left`);
  }catch(e){ 
    console.log('❌ DP Error:', e.message); 
  }
}

async function startBot(){
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const sock = makeWASocket({ auth: state, printQRInTerminal: false, logger: { level: 'silent' } });
  sockRef = sock;
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', async (update)=>{
    const { connection, lastDisconnect, qr } = update;
    if(qr){ latestQR = qr; console.log('QR Generated'); }
    if(connection === 'close'){
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if(shouldReconnect) startBot();
    }
    if(connection === 'open'){
      console.log('✅ Bot Connected!');
      latestQR = '';
      try{
        const groups = await sock.groupFetchAllParticipating();
        console.log('--- ALL GROUPS LIST ---');
        Object.entries(groups).forEach(([id, g]) => console.log(`${g.subject} => ${id}`));
        console.log('--- END LIST ---');
      }catch(e){ console.log('Fetch groups error', e.message); }
      await updateDP(sock);
    }
  });
}
startBot();

app.get('/', async (req,res)=>{
  if(!latestQR) return res.send(`<h2>✅ Bot Connected! ${getDaysLeft()} days left</h2>`);
  const qrImg = await qrcode2.toDataURL(latestQR);
  res.send(`<div style="text-align:center"><h2>Scan QR</h2><img src="${qrImg}" style="width:300px"><script>setTimeout(()=>location.reload(),20000)</script></div>`);
});
app.listen(PORT, ()=>console.log('Server on '+PORT));

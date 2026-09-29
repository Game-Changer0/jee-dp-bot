const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { createCanvas, loadImage } = require('canvas');
const qrcode = require('qrcode-terminal');
const qrcode2 = require('qrcode');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

let latestQR = '';
const GROUP_ID = '120599025434049026@g.us'; // your Academic Allies

async function generateImage(days) {
  const canvas = createCanvas(800, 800);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0f0f0f'; ctx.fillRect(0,0,800,800);
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 120px Arial'; ctx.textAlign='center';
  ctx.fillText(days, 400, 350);
  ctx.font = 'bold 40px Arial'; ctx.fillText('DAYS LEFT', 400, 420);
  ctx.font = '20px Arial'; ctx.fillStyle = '#a3a3a3'; ctx.fillText('JEE 2027', 400, 700);
  return canvas.toBuffer('image/jpeg');
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const sock = makeWASocket({ auth: state, printQRInTerminal: true });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if(qr){
      latestQR = qr;
      qrcode.generate(qr, {small: true});
      console.log('QR Generated');
    }
    if(connection === 'close'){
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if(shouldReconnect) startBot();
    }
    if(connection === 'open'){
      console.log('Bot Connected!');
      const examDate = new Date('2027-01-24');
      const diff = Math.ceil((examDate - new Date()) / (1000*60*60*24));
      const img = await generateImage(diff);
      try{
        await sock.groupUpdateSubject(GROUP_ID, `Academic Allies - ${diff} Days Left`);
        await sock.updateProfilePicture(GROUP_ID, img);
        console.log('DP Updated');
      }catch(e){ console.log('DP Error', e.message); }
    }
  });
}

startBot();

app.get('/', async (req,res)=>{
  if(!latestQR) return res.send('<h2>Bot Starting... Refresh in 10 sec</h2><script>setTimeout(()=>location.reload(),5000)</script>');
  const qrImg = await qrcode2.toDataURL(latestQR);
  res.send(`<div style="text-align:center;font-family:sans-serif"><h2>Scan QR - JEE DP Bot</h2><img src="${qrImg}" style="width:300px"><p>Bot Alive - ${Math.ceil((new Date('2027-01-24')-new Date())/(1000*60*60*24))} days left</p><script>setTimeout(()=>location.reload(),20000)</script></div>`);
});
app.listen(PORT, ()=>console.log('Server on '+PORT));

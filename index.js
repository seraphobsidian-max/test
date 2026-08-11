const express = require("express");
const login = require("fca-unofficial");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const OWNER_IDS = ["61592019641097"];
let LOCKED_GC_NAME = "Ang Aming GC";

// --- BOT METRICS & LOGS PARA SA DASHBOARD ---
let botMetrics = {
  status: "Offline",
  startTime: null,
  totalMessages: 0,
  lastEvent: "Wala pang aktibidad",
  logs: []
};

// Function para magdagdag ng live logs sa dashboard
function addLog(message) {
  const time = new Date().toLocaleTimeString("en-PH", { timeZone: "Asia/Manila" });
  const logEntry = `[${time}] ${message}`;
  console.log(logEntry);
  botMetrics.logs.unshift(logEntry);
  if (botMetrics.logs.length > 20) botMetrics.logs.pop(); // Huling 20 logs lamang
}

// Helper: Patakbuhin ang Messenger Bot
function startBot(appStateData) {
  addLog("Sinusubukang mag-login...");
  botMetrics.status = "Logging in...";

  login({ appState: appStateData }, (err, api) => {
    if (err) {
      addLog("Login Error: " + err.message);
      botMetrics.status = "Error";
      return;
    }

    botMetrics.status = "Online";
    botMetrics.startTime = new Date();
    addLog("Bot successfully connected and listening for messages!");

    api.setOptions({ listenEvents: true, selfListen: false });

    api.listenMqtt((err, event) => {
      if (err) {
        addLog("Listen Error: " + err.message);
        return;
      }

      // 1. LOCK GC NAME
      if (event.type === "event" && event.logMessageType === "log:thread-name") {
        const newTitle = event.logMessageData.name;
        if (newTitle !== LOCKED_GC_NAME) {
          api.setTitle(LOCKED_GC_NAME, event.threadID, (err) => {
            if (!err) {
              api.sendMessage("🔒 Bawal palitan ang pangalan ng GC!", event.threadID);
              addLog(`Naka-detect ng pagpalit ng title. Binalik sa "${LOCKED_GC_NAME}".`);
            }
          });
        }
      }

      if (event.type === "message") {
        botMetrics.totalMessages++;
        botMetrics.lastEvent = `Nakatanggap ng mensahe mula sa ID: ${event.senderID}`;

        const body = event.body ? event.body.trim() : "";
        const args = body.split(" ");
        const command = args[0].toLowerCase();
        const senderID = event.senderID;
        const isOwner = OWNER_IDS.includes(senderID);

        // 2. AUTO RESPONSE
        if (body.toLowerCase() === "hello" || body.toLowerCase() === "hi") {
          api.sendMessage("Hello! Online ang Messenger bot 24/7 mula sa Railway.", event.threadID, event.messageID);
          addLog(`Sumagot sa 'hello/hi' ni ${senderID}`);
        }

        // 3. SET ALL NICKNAMES (!setall [nickname]) - OWNER ONLY
        if (command === "!setall") {
          if (!isOwner) return api.sendMessage("❌ Command na ito ay para lamang sa Bot Owner.", event.threadID, event.messageID);
          
          const nickname = args.slice(1).join(" ");
          if (!nickname) return api.sendMessage("❌ Gamit: !setall [Nickname]", event.threadID, event.messageID);

          api.getThreadInfo(event.threadID, (err, info) => {
            if (err) return;
            api.sendMessage(`⏳ Pinapalitan ang nickname ng lahat sa "${nickname}"...`, event.threadID);
            addLog(`Inilunsad ang !setall ni Owner sa GC: ${event.threadID}`);

            info.participantIDs.forEach((userID, index) => {
              setTimeout(() => {
                api.changeNickname(nickname, event.threadID, userID);
              }, index * 1000);
            });
          });
        }

        // 4. KICK MEMBER (!kick) - OWNER ONLY
        if (command === "!kick") {
          if (!isOwner) return api.sendMessage("❌ Command na ito ay para lamang sa Bot Owner.", event.threadID, event.messageID);
          
          let targetID = Object.keys(event.mentions)[0] || (event.messageReply ? event.messageReply.senderID : null);
          if (!targetID) return api.sendMessage("❌ Mag-tag o mag-reply sa i-kikick.", event.threadID, event.messageID);
          if (OWNER_IDS.includes(targetID)) return api.sendMessage("❌ Hindi pwedeng i-kick ang Bot Owner!", event.threadID, event.messageID);

          api.removeUserFromGroup(targetID, event.threadID, (err) => {
            if (err) {
              api.sendMessage("❌ Error! Siguraduhing admin ang bot sa GC.", event.threadID, event.messageID);
            } else {
              api.sendMessage("👋 Na-kick na ang user sa GC.", event.threadID);
              addLog(`Kina-kick ang user ${targetID} sa GC: ${event.threadID}`);
            }
          });
        }
      }
    });
  });
}

// Kukunin ang APPSTATE mula sa Railway Variables kung mayroon
if (process.env.APPSTATE) {
  try {
    startBot(JSON.parse(process.env.APPSTATE));
  } catch (e) {
    addLog("Error sa pagbasa ng APPSTATE mula sa Environment Variable.");
  }
}

// --- WEB DASHBOARD ROUTES ---
app.get("/", (req, res) => {
  let uptimeStr = "0m";
  if (botMetrics.startTime) {
    const diff = Math.floor((new Date() - botMetrics.startTime) / 1000);
    const hrs = Math.floor(diff / 3600);
    const mins = Math.floor((diff % 3600) / 60);
    uptimeStr = `${hrs}h ${mins}m`;
  }

  const statusColor = botMetrics.status === "Online" ? "#00e676" : "#ff5252";

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Bot Status Dashboard</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f172a; color: #f8fafc; margin: 0; padding: 20px; }
        .container { max-width: 800px; margin: 0 auto; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155; padding-bottom: 15px; margin-bottom: 20px; }
        .status-badge { background: ${statusColor}22; color: ${statusColor}; padding: 6px 16px; border-radius: 20px; font-weight: bold; border: 1px solid ${statusColor}; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 25px; }
        .card { background: #1e293b; border-radius: 10px; padding: 15px; border: 1px solid #334155; }
        .card h4 { margin: 0 0 8px 0; color: #94a3b8; font-size: 0.85rem; text-transform: uppercase; }
        .card .value { font-size: 1.4rem; font-weight: bold; }
        .logs-box { background: #020617; border-radius: 8px; padding: 15px; font-family: monospace; height: 200px; overflow-y: auto; border: 1px solid #334155; font-size: 0.85rem; }
        .log-line { margin-bottom: 5px; color: #cbd5e1; }
        textarea { width: 100%; height: 100px; background: #0f172a; color: #f8fafc; border: 1px solid #334155; border-radius: 6px; padding: 10px; font-family: monospace; margin-top: 10px; }
        button { background: #2563eb; color: white; border: none; padding: 10px 18px; border-radius: 6px; font-weight: bold; cursor: pointer; width: 100%; margin-top: 10px; }
        button:hover { background: #1d4ed8; }
      </style>
      <meta http-equiv="refresh" content="10">
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>🤖 Bot Live Status</h2>
          <span class="status-badge">${botMetrics.status}</span>
        </div>

        <div class="grid">
          <div class="card">
            <h4>Uptime</h4>
            <div class="value">${uptimeStr}</div>
          </div>
          <div class="card">
            <h4>Total Messages</h4>
            <div class="value">${botMetrics.totalMessages}</div>
          </div>
          <div class="card">
            <h4>Owner ID</h4>
            <div class="value" style="font-size: 0.95rem;">${OWNER_IDS[0]}</div>
          </div>
        </div>

        <h3>Live Activity Logs</h3>
        <div class="logs-box">
          ${botMetrics.logs.map(log => `<div class="log-line">${log}</div>`).join('') || '<div class="log-line">Walang active logs...</div>'}
        </div>

        <br>
        <div class="card">
          <h4>Update AppState (Session Cookie)</h4>
          <form action="/update-appstate" method="POST">
            <textarea name="appstate" placeholder="I-paste dito ang bagong AppState JSON..." required></textarea>
            <button type="submit">Restart / Start Bot</button>
          </form>
        </div>
      </div>
    </body>
    </html>
  `);
});

app.post("/update-appstate", (req, res) => {
  try {
    const newAppState = JSON.parse(req.body.appstate);
    addLog("Manual restart initiated mula sa Dashboard...");
    startBot(newAppState);
    res.redirect("/");
  } catch (e) {
    res.send("❌ Invalid JSON Format. Pakisiguradong tama ang na-copy na appstate. <a href='/'>Bumalik</a>");
  }
});

app.listen(PORT, () => {
  console.log(`Dashboard server running on port ${PORT}`);
});

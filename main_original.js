const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, 'config.json');

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    const defaults = { video_id: '', max_messages: 200 };
    writeConfig(defaults);
    return defaults;
  }
}

function writeConfig(config) {
  fs.writeFileSync(configPath, JSON.stringify(config, null, '\t'));
}

// Variables for chat loop
const seenMessageIds = new Set();
let currentVideoId = "";
let numTimes = 0;
let newContinuation;
let pollRunning = false;
let pollingStopped = null;

const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');

ipcMain.handle('open-external', (_, url) => {
    shell.openExternal(url);
});

ipcMain.handle('set-max-messages', (_, count) => {
  const config = readConfig();
  config.max_messages = count;
  writeConfig(config);
  return { success: true };
});

ipcMain.handle('get-config', () => {
  return readConfig();
});

ipcMain.handle('switch-video', async (_, newVideoId) => {
  try {
    if (pollRunning) {
      await new Promise(resolve => {
        pollingStopped = resolve;
      });
    }

    currentVideoId = newVideoId;
    seenMessageIds.clear();

    const config = readConfig();
    config.video_id = newVideoId;
    writeConfig(config);

    if (win) win.webContents.send('clear-chat');

    newContinuation = await getInitialContinuation(currentVideoId);
    pollChat();
    return { success: true };
  } catch (e) {
    console.log("switch-video error:", e);
    return { success: false, error: e.message };
  }
});

app.disableHardwareAcceleration();

let win;

// function in testing
async function getInitialContinuation(videoId) {
 const res = await fetch(`https://www.youtube.com/live_chat?v=${videoId}`, {
  headers: {
   // pretend to have a modern browser so YouTube doesn't complain
   "User-Agent": 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
   "Accept-Language": 'en-US,en;q=0.9', // english
  }
 });

 const html = await res.text();

 // Use this to debug the HTML: console.log(html);

 const match = html.match(/"continuation":"([^"]+)"/); // Extract continuation from returned HTML

 if (!match) {
  console.log(html);
  throw new Error("Failed to extract continuation");
 }

 return match[1];
}



function getContinuation(json) {
 const cont = json.continuationContents?.liveChatContinuation?.continuations?.[0];

 if (!cont) return null;

 return (
  cont.timedContinuationData?.continuation ||
  cont.invalidationContinuationData?.continuation ||
  cont.reloadContinuationData?.continuation ||
  cont.liveChatReplayContinuationData?.continuation ||
  null
 );
}

function formatTimestamp(timestamp) {
 const ms = Math.floor(timestamp / 1000);
 return new Intl.DateTimeFormat("en-US", {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
  fractionalSecondDigits: 3
 }).format(ms);
}

// Push chat to UI
function pushToUI(timestamp, ranks, authorID, authorhandler, message, pfp) {
 if (win) {
  win.webContents.send('chat-message', { timestamp, ranks, authorID, authorhandler, message, pfp });
 }
}

// Emoji paresr
function parseMessageRuns(runs = []) {
 return runs.map(item => {
  if (item.text) {
   return { type: "text", value: item.text };
  }

  if (item.emoji?.emojiId) {
   const emoji = item.emoji;

   // Pick thumbnail[1] or fallback to [0]
   const thumb =
    emoji.image?.thumbnails?.[1]?.url ||
    emoji.image?.thumbnails?.[0]?.url;

   return {
    type: "emoji",
    id: emoji.emojiId,
    url: thumb
   };
  }

  return null;
 }).filter(Boolean);
}

// Chat loop
async function pollChat() {
  pollRunning = true;
  try {
 while (true) {
    if (pollingStopped) {
      const resolve = pollingStopped;
      pollingStopped = null;
      resolve();
      return;
    }
  try {
   const response = await fetch("https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?prettyPrint=false", {
    method: "POST",
    headers: {
     "Content-Type": "application/json",
     // pretending to have a modern browser so YouTube doesn't complain
     "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36"
    },
    body: JSON.stringify({
     context: {
      client: {
       clientName: "WEB",
       clientVersion: '2.20260603.05.00' // pretending to have a new browser version so YouTube doesn't complain
      }
     },
     continuation: newContinuation
    })
   });

   numTimes++;

   const json = await response.json();

   const nextContinuation = getContinuation(json);

   if (nextContinuation) {
    newContinuation = nextContinuation;
   }

   const actions =
    json.continuationContents?.liveChatContinuation?.actions ?? [];

   for (const action of actions) {
    const renderer =
     action.addChatItemAction?.item?.liveChatTextMessageRenderer;

    if (!renderer) continue;

    const messageId = renderer.id;

    // Skip duplicates
    if (messageId && seenMessageIds.has(messageId)) {
     continue;
    }

    // Mark as seen
    if (messageId) {
     seenMessageIds.add(messageId);

     // Memory limit
     if (seenMessageIds.size > 50000) {
      const oldest = seenMessageIds.values().next().value;
      seenMessageIds.delete(oldest);
     }
    }

    const pfp =
     renderer.authorPhoto?.thumbnails?.at(-1)?.url ||
     renderer.authorPhoto?.thumbnails?.[0]?.url;

    const timestamp = formatTimestamp(renderer.timestampUsec);
	ranks = undefined;
	if (renderer.authorBadges)
		// This was hard but i got it
		ranks = renderer.authorBadges.map(badge => badge.liveChatAuthorBadgeRenderer.accessibility.accessibilityData.label).join(', ');
    const message = parseMessageRuns(renderer.message?.runs ?? []);
    const authorID = renderer.authorExternalChannelId ?? "Unknown";
    const authorhandler = renderer.authorName?.simpleText ?? "Unknown";

    pushToUI(
     timestamp,
	 ranks,
     authorID,
     authorhandler,
     message,
     pfp
    );
   }
   } catch (e) {
    console.log("error:", e);

    // Avoid a tight error loop
    await new Promise(resolve => setTimeout(resolve, 1000));
   }
  }
 } finally {
  pollRunning = false;
 }
}

// Menu
function setupMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' }
      ]
    },
    {
      label: 'Live',
      submenu: [
        {
          label: 'Change Video ID...',
          accelerator: 'CmdOrCtrl+Shift+V',
          click: () => {
            if (win) win.webContents.send('show-video-prompt');
          }
        },
        {
          label: 'Change Max Messages...',
          accelerator: 'CmdOrCtrl+Shift+M',
          click: () => {
            if (win) win.webContents.send('show-max-messages-prompt');
          }
        }
      ]
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Window
function createWindow() {
 win = new BrowserWindow({
  width: 800,
  height: 600,
  webPreferences: {
   preload: __dirname + "/preload.js"
  }
 });

  win.loadFile("index.html");
 }

app.whenReady().then(async () => {
 setupMenu();
 createWindow();
 const config = readConfig();
 currentVideoId = config.video_id;
 if (currentVideoId) {
  newContinuation = await getInitialContinuation(currentVideoId);
  pollChat();
 }
});
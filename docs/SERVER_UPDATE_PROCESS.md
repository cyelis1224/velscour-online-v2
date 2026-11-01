# Graceful Server Shutdown & Deployment Process

> [!IMPORTANT]
> **MANDATORY PROCESS FOR ALL DEPLOYMENTS & REBOOTS:**
> Whenever updating code, deploying a new build version, or restarting the server, you **MUST** follow this graceful shutdown procedure. Never abruptly kill `server.js` while players are connected in dungeons, lobbies, or active combat, as abrupt termination risks lost progression or out-of-order state overwrites.

---

## 1. Automated Graceful Shutdown Flow

The Dagyr Online server includes an automated 3-minute countdown mechanism that:
1. **Warns All Connected Players**: Broadcasts urgent warning messages to every client (in dungeon rooms, towns, and Battle.net lobby) across chat, screen center, and HUD.
2. **Auto-Triggers Client Saves**: As soon as a client receives the shutdown warning, it automatically performs a background character save to the server.
3. **Displays Countdown**: Clients see periodic countdown reminders (at 3m, 2m, 1m, 30s, 15s, 10s..1s) urging them to move to a safe zone and Save & Exit.
4. **Final Flush & Exit**: When the timer reaches 0, the server flushes all account sessions and character rosters atomically to disk, cleanly disconnects remaining sockets with a polite update dialog, closes the HTTP listener, and exits.

---

## 2. Standard Update & Deployment Procedure

When you (the agent or developer) are ready to push an update:

### Step 1: Initiate the 3-Minute Graceful Shutdown
From the workspace terminal, run:
```bash
npm run server:shutdown
# Or with a custom reason/time:
node scripts/shutdown.js 3 "Updating to version 0.1.4"
```
* The server will immediately notify all connected players:
  > *"[SERVER RESTART] The server is restarting for an update in 3 minute(s)! Please get to a safe place and Save & Exit to avoid data loss."*
* Active clients will save their state automatically and players can safely finish their current chamber or pause and click **Save & Quit**.

### Step 2: Wait for Clean Server Termination
Watch the server logs or wait for the script/process to finish. The server will countdown:
* 3 minutes left
* 2 minutes left
* 1 minute left
* 30 seconds left
* 10 seconds down to 0 seconds
At 0s, you will see in the server log:
```
[SERVER SHUTTING DOWN NOW] Flushing all data to disk...
[DAGYR ONLINE] Server stopped cleanly. Ready for update.
```

### Step 3: Prepare and Sync Assets
Prepare Web, Android, and Desktop bundles:
```bash
npm run mobile:prepare
```

### Step 4: Start the Updated Server
Start the server in background daemon mode:
```bash
node server.js
```

### Step 5: Verify Server Health
Check that the server is responding on both HTTP and WebSocket:
```bash
curl -s http://127.0.0.1:8124/api/version
```
Ensure it returns `"ok": true` and the updated version string.

---

## 3. Useful Commands

| Task | Command |
| :--- | :--- |
| **Start 3-Minute Shutdown** | `npm run server:shutdown` |
| **Start Custom Shutdown** | `node scripts/shutdown.js <minutes> "<reason>"` |
| **Cancel Scheduled Shutdown** | `npm run server:shutdown:cancel` |
| **Immediate Clean Shutdown (0s)** | `npm run server:shutdown:now` |

---

## 4. Safety Guarantees Built-in
1. **Server-Side Level Rollback Guard**: Even if an old client packet arrives out-of-order, `server.js` enforces `level = Math.max(existing.level, incoming.level)` to prevent level regression.
2. **Atomic Writes**: All session files and account character rosters are written using `writeJsonAtomic()` (write-to-temp + rename) so no file is ever corrupted if power is lost mid-write.
3. **Sequential Save Chain**: Client-side saves use strict FIFO queueing (`flushOnlineSave()`) so requests never race each other.


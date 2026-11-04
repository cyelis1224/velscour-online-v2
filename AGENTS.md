# Velscour Online - Agent Directives & Operational Rules

## ⚠️ MANDATORY RULE: Graceful Server Shutdown Before Pushing Updates
Whenever an agent or developer needs to update code, apply migrations, or restart the server (`server.js`), you **MUST ALWAYS** follow the Graceful Server Shutdown Procedure documented in [docs/SERVER_UPDATE_PROCESS.md](file:///home/dagyr/dagyr-online/Dagyr-Online/docs/SERVER_UPDATE_PROCESS.md).

### Deployment & Restart Checklist:
1. **Never kill `server.js` abruptly** with `kill -9` or immediate process termination while players are connected.
2. **Always initiate a graceful shutdown broadcast**:
   ```bash
   npm run server:shutdown
   # Or: node scripts/shutdown.js 3 "Updating server"
   ```
3. **Wait for the 3-minute countdown to complete**:
   - The server warns all players in real time via chat and HUD countdowns.
   - All connected clients automatically flush character saves.
   - The server flushes all accounts and character data atomically to disk before closing.
4. **Prepare assets & sync**:
   ```bash
   npm run mobile:prepare
   ```
5. **Start the new server instance cleanly**:
   ```bash
   node server.js
   ```
6. **Verify server health**:
   ```bash
   curl -s http://127.0.0.1:8124/api/version
   ```

---

## Character Data & Save Integrity Rules
1. **Save Before Exit**: Any exit action (Lobby "Quit", Pause Menu "Save & Quit", Logout) must explicitly await `saveOnlineCharacter` / `flushOnlineSave()` before tearing down the session or navigating away.
2. **Level Progression Guard**: `server.js` must always protect character levels from regressing (`Math.max(existing.level, incoming.level)`).
3. **Periodic Autosaves**: Character progress must be persisted periodically (every 30s in game, every 60s in lobby), and immediately upon Level-Up and Attribute/Skill allocation.


// Velscour Online - Town Sparring & Duel System
// Safe 1-HP sparring in town with boundary ring, countdown fanfare, and spectator visibility.

import { G } from '../state.js';
import { el, escapeHtml, dist } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { UI } from '../ui/ui.js';
import { net } from '../net/network.js';
import { isoX, isoY } from '../core/view.js';
import { floatText, sparkle, burst } from '../gfx/vfx.js';

export function isDuelTarget(c) {
  if (!c || c.dead) return false;
  if (G.world?.kind === 'arena') {
    if (c.isRemotePlayer) return true;
    if (c.isRemoteSummon || (c.summon && c.team === 'player' && c.owner !== G.player)) return true;
  }
  if (c.isDuelOpponent) return true;
  if (DuelManager.activeDuel) {
    const oppId = DuelManager.activeDuel.opponentId;
    if (oppId != null) {
      if (c.id === oppId || String(c.id) === String(oppId)) return true;
      if (c.summon && c.owner && (c.owner.id === oppId || String(c.owner.id) === String(oppId))) return true;
    }
  }
  if (c.summon && c.owner && c.owner.isDuelOpponent) return true;
  return false;
}

class DuelManagerClass {
  constructor() {
    this.activeDuel = null;
    this.promptEl = null;
    this.promptTimer = null;
    this.bannerEl = null;
    this._endTimer = null;
    this._bannerTimer = null;
  }

  _clearTimers() {
    if (this._endTimer) {
      clearTimeout(this._endTimer);
      this._endTimer = null;
    }
    if (this._bannerTimer) {
      clearTimeout(this._bannerTimer);
      this._bannerTimer = null;
    }
  }

  _findRemotePlayer(id, name = null) {
    if (!G.remotePlayers) return null;
    return G.remotePlayers.get(id) || Array.from(G.remotePlayers.values()).find((p) =>
      (id != null && String(p.id) === String(id)) || (name && p.name === name)
    ) || null;
  }

  isDueling() {
    return !!this.activeDuel && this.activeDuel.state !== 'finished';
  }

  requestDuel(partnerRp) {
    if (!partnerRp || !partnerRp.id) return;
    if (this.activeDuel) {
      UI.log('A duel is already in progress.', '#ff8080');
      return;
    }
    sfx('ui');
    net.send({
      type: 'duel_request',
      targetId: partnerRp.id,
      targetName: partnerRp.name,
    });
    UI.log(`Challenged <b style="color:#ffd34a">${escapeHtml(partnerRp.name)}</b> to a duel...`, '#8fe0ff');
  }

  handleDuelPrompt(data) {
    this.clearPrompt();
    sfx('horn');

    const prompt = el('div', 'duel-prompt-banner');
    prompt.innerHTML = `
      <div class="dpb-content">
        <span class="dpb-icon">⚔️</span>
        <span class="dpb-text"><b style="color:#ffd34a">${escapeHtml(data.fromName || 'Adventurer')}</b> challenges you to a duel!</span>
      </div>
      <div class="dpb-actions">
        <button type="button" class="btn small dpb-accept" id="dpb-accept">Accept</button>
        <button type="button" class="btn small dpb-decline" id="dpb-decline">Decline</button>
      </div>
    `;

    prompt.querySelector('#dpb-accept').onclick = () => {
      sfx('ui');
      this.clearPrompt();
      net.send({
        type: 'duel_respond',
        fromId: data.fromId,
        accept: true,
      });
    };

    prompt.querySelector('#dpb-decline').onclick = () => {
      sfx('ui');
      this.clearPrompt();
      net.send({
        type: 'duel_respond',
        fromId: data.fromId,
        accept: false,
      });
    };

    document.body.appendChild(prompt);
    this.promptEl = prompt;

    this.promptTimer = setTimeout(() => {
      this.clearPrompt();
      net.send({
        type: 'duel_respond',
        fromId: data.fromId,
        accept: false,
      });
    }, 20000);
  }

  clearPrompt() {
    if (this.promptTimer) {
      clearTimeout(this.promptTimer);
      this.promptTimer = null;
    }
    if (this.promptEl) {
      this.promptEl.remove();
      this.promptEl = null;
    }
  }

  startDuel(data) {
    const isP1 = data?.p1 && String(data.p1.id) === String(net.myId);
    const isP2 = data?.p2 && String(data.p2.id) === String(net.myId);
    if (!isP1 && !isP2) return; // Bystanders in rooms with >2 players must not be pulled into the duel

    this._clearTimers();
    this.clearPrompt();
    sfx('horn');

    const opponent = isP1 ? data.p2 : data.p1;
    const mySpawn = isP1 ? [16, 7] : [16, 25];

    // Clear any stale opponent flags before marking the new duel opponent
    if (G.remotePlayers) {
      for (const other of G.remotePlayers.values()) other.isDuelOpponent = false;
    }

    // Mark remote player as duel opponent and reset any stale combat/loading state
    const rp = this._findRemotePlayer(opponent.id, opponent.name);
    if (rp) {
      rp.isDuelOpponent = true;
      rp.dead = false;
      rp.invuln = 0;
      rp.targetable = true;
      rp.isLoading = false;
      rp.alpha = 1;
      if (rp.hp <= 0) rp.hp = rp.maxHp || 100;
      if (rp.killedSummonIds) rp.killedSummonIds.clear();
    }

    this.activeDuel = {
      duelId: data.duelId,
      opponentId: opponent.id,
      opponentName: opponent.name,
      opponentClass: opponent.classId,
      state: 'countdown',
      countdown: 3.5,
    };

    if (G.game?.enterArena) {
      G.game.enterArena(data, mySpawn);
    }

    if (G.player) {
      G.player.dead = false;
      G.player.invuln = 0;
      G.player.targetable = true;
    }

    this.showBanner('DUEL IN 3…', '#ffd34a');
    UI.log(`⚔️ Transported to the Grand Arena for duel against <b style="color:#ffd34a">${escapeHtml(opponent.name)}</b>!`, '#ff9966');
  }

  showBanner(text, color = '#ffd34a') {
    if (!this.bannerEl) {
      this.bannerEl = el('div', 'duel-center-banner');
      document.body.appendChild(this.bannerEl);
    }
    this.bannerEl.textContent = text;
    this.bannerEl.style.color = color;
    this.bannerEl.classList.remove('fade');
    void this.bannerEl.offsetWidth; // re-flow
    this.bannerEl.classList.add('fade');
  }

  clearBanner() {
    if (this.bannerEl) {
      this.bannerEl.remove();
      this.bannerEl = null;
    }
  }

  update(dt) {
    if (!this.activeDuel) return;
    const d = this.activeDuel;
    const p = G.player;
    if (!p) return;

    if (d.state === 'countdown') {
      const prevInt = Math.ceil(d.countdown);
      d.countdown -= dt;
      const nextInt = Math.ceil(d.countdown);
      if (nextInt !== prevInt && nextInt > 0) {
        sfx('ui');
        this.showBanner(`DUEL IN ${nextInt}…`, '#ffd34a');
      } else if (d.countdown <= 0) {
        d.state = 'fighting';
        sfx('shout');
        this.showBanner('FIGHT!', '#ff4444');
        p.castLock = 0;
        if (this._bannerTimer) clearTimeout(this._bannerTimer);
        this._bannerTimer = setTimeout(() => {
          this._bannerTimer = null;
          this.clearBanner();
        }, 1500);
      }
      return;
    }
  }

  drawGround(ctx) {
    if (!this.activeDuel || G.world?.kind !== 'town') return;
    const d = this.activeDuel;
    const px = isoX(d.ringX, d.ringY);
    const py = isoY(d.ringX, d.ringY);
    const rx = d.radius * 32 * 1.41;
    const ry = d.radius * 16 * 1.41;

    ctx.save();
    // Sparring ring boundary
    const pulse = 0.6 + 0.3 * Math.sin(Date.now() * 0.004);
    ctx.strokeStyle = d.state === 'fighting' ? `rgba(255, 75, 45, ${pulse})` : `rgba(255, 215, 80, ${pulse})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Subtle area glow
    ctx.fillStyle = d.state === 'fighting' ? 'rgba(255, 60, 30, 0.04)' : 'rgba(255, 215, 80, 0.03)';
    ctx.fill();
    ctx.restore();
  }

  handleDuelHit(data) {
    if (!this.activeDuel) return;
    const isTargetMe = !data.targetId || String(data.targetId) === String(net.myId);
    const p = G.player;
    if (isTargetMe && p) {
      const dmg = Number(data.dmg) || 10;
      // Safe 1-HP sparring cap
      if (p.hp - dmg <= 1) {
        p.hp = 1;
        this.onDefeated();
      } else {
        p.hp -= dmg;
        floatText(p.x, p.y, 40, `-${Math.round(dmg)}`, '#ff4030', 14);
        sfx('hurt');
      }
    } else {
      const rp = G.remotePlayers?.get(data.targetId) || (G.remotePlayers && Array.from(G.remotePlayers.values()).find(p => String(p.id) === String(data.targetId)));
      if (rp) {
        floatText(rp.x, rp.y, 40, `-${Math.round(data.dmg || 10)}`, '#ffd34a', 14);
        sfx('hurt');
      }
    }
  }

  handleDuelSummonHit(data) {
    if (!this.activeDuel && G.world?.kind !== 'arena') return;
    if (data.sourceId != null && String(data.sourceId) === String(net.myId)) return; // Already applied locally by attacker
    if (data.duelId && this.activeDuel && this.activeDuel.duelId !== data.duelId) return;
    const oppId = this.activeDuel?.opponentId;
    const isTargetMySummon = (data.ownerId != null && String(data.ownerId) === String(net.myId)) ||
      (data.ownerId == null && oppId != null && data.sourceId != null && String(data.sourceId) === String(oppId));
    if (isTargetMySummon && G.world?.creatures) {
      let mySummon = null;
      const isMyLocalSummon = (c) => c && c.summon && !c.isRemoteSummon && c.owner === G.player && !c.dead;
      if (data.summonId) {
        mySummon = G.world.creatures.find((c) => isMyLocalSummon(c) && c.summonId === data.summonId);
      }
      // Only use spatial fallback when summonId was not provided; never kill a different summon on a duplicate/stale summonId
      if (!mySummon && !data.summonId && typeof data.x === 'number' && typeof data.y === 'number') {
        let bestDist = 3.5;
        for (const c of G.world.creatures) {
          if (isMyLocalSummon(c)) {
            const d = dist(c.x, c.y, data.x, data.y);
            const keyMatch = data.summonKey && c.summonKey === data.summonKey ? -1.5 : 0;
            if (d + keyMatch < bestDist) {
              bestDist = d + keyMatch;
              mySummon = c;
            }
          }
        }
      }

      if (mySummon) {
        const dmg = Number(data.dmg) || 10;
        mySummon.hp -= dmg;
        floatText(mySummon.x, mySummon.y, 35, `-${Math.round(dmg)}`, '#ff4030', 12);
        sfx('hurt');
        if (data.killed || mySummon.hp <= 0) {
          mySummon.dead = true;
          mySummon.hp = 0;
          burst(mySummon.x, mySummon.y, 14, '#ff6060', 8, 1.2);
          const idx = G.world.creatures.indexOf(mySummon);
          if (idx !== -1) G.world.creatures.splice(idx, 1);
        }
      }
    } else {
      const rp = this._findRemotePlayer(data.ownerId ?? oppId);
      let rs = rp?.summons?.get(data.summonId);
      if (!rs && !data.summonId && G.world?.creatures && typeof data.x === 'number' && typeof data.y === 'number') {
        rs = G.world.creatures.find((c) => c.isRemoteSummon && !c.dead && dist(c.x, c.y, data.x, data.y) < 2);
      }
      if (rs) {
        const dmg = Number(data.dmg) || 10;
        rs.hp = Math.max(0, (rs.hp || 10) - dmg);
        floatText(rs.x, rs.y, 35, `-${Math.round(dmg)}`, '#ffd34a', 12);
        if (data.killed || rs.hp <= 0) {
          rs.dead = true;
          rs.hp = 0;
          burst(rs.x, rs.y, 14, '#ff6060', 8, 1.2);
          if (rp?.markSummonKilled && data.summonId) rp.markSummonKilled(data.summonId);
          if (G.world?.creatures) {
            const idx = G.world.creatures.indexOf(rs);
            if (idx !== -1) G.world.creatures.splice(idx, 1);
          }
          if (data.summonId) rp?.summons?.delete(data.summonId);
        }
      }
    }
  }

  onDefeated() {
    if (!this.activeDuel || this.activeDuel.state === 'finished') return;
    this.activeDuel.state = 'finished';
    net.send({
      type: 'duel_defeat',
      duelId: this.activeDuel.duelId,
      defeatedId: net.myId,
    });
  }

  forfeit() {
    if (!this.activeDuel) return;
    this._clearTimers();
    const duelId = this.activeDuel.duelId;
    const oppId = this.activeDuel.opponentId;
    this.activeDuel = null;
    const rp = this._findRemotePlayer(oppId);
    if (rp) rp.isDuelOpponent = false;
    net.send({
      type: 'duel_forfeit',
      duelId,
    });
    this.restorePlayer();
    this.showBanner('DUEL FORFEITED', '#ff6666');
    this._endTimer = setTimeout(() => {
      this._endTimer = null;
      this.clearBanner();
      if (!this.activeDuel && G.world?.kind === 'arena') {
        G.game?.enterTown();
      }
    }, 2000);
  }

  endDuel(data) {
    const isWinner = data?.winnerId != null && String(data.winnerId) === String(net.myId);
    const isLoser = data?.loserId != null && String(data.loserId) === String(net.myId);
    const isMyDuel = (this.activeDuel && (!data?.duelId || this.activeDuel.duelId === data.duelId)) || isWinner || isLoser;

    if (!isMyDuel) {
      // Bystander in the room: log the outcome in chat without affecting their state or position
      if (data?.winnerName && data?.loserName) {
        UI.log(`⚔️ <b style="color:#ffd34a">${escapeHtml(data.winnerName)}</b> defeated <b style="color:#ffd34a">${escapeHtml(data.loserName)}</b> in the Grand Arena!`, '#ffd34a');
      }
      return;
    }

    this._clearTimers();
    this.clearPrompt();
    const won = isWinner;
    const partnerName = won ? data.loserName : data.winnerName;

    if (won) {
      sfx('victory');
      if (G.player) sparkle(G.player.x, G.player.y, 35, '#ffd700', 30, 0.8);
      this.showBanner('VICTORY!', '#ffd700');
      UI.log(`🏆 You defeated <b style="color:#ffd34a">${escapeHtml(partnerName)}</b> in the Grand Arena!`, '#ffd34a');
    } else {
      sfx('defeat');
      this.showBanner('DEFEAT', '#ff4444');
      UI.log(`💀 <b style="color:#ffd34a">${escapeHtml(partnerName)}</b> won the duel in the Grand Arena!`, '#ff8888');
    }

    // Unmark remote player
    const oppId = this.activeDuel?.opponentId ?? (won ? data.loserId : data.winnerId);
    if (oppId != null) {
      const rp = this._findRemotePlayer(oppId, partnerName);
      if (rp) rp.isDuelOpponent = false;
    }

    this.activeDuel = null;
    this.restorePlayer();

    // After 3.5s victory celebration, return to town (unless a new duel has already started)
    this._endTimer = setTimeout(() => {
      this._endTimer = null;
      this.clearBanner();
      if (!this.activeDuel && G.world?.kind === 'arena') {
        G.game?.enterTown();
      }
    }, 3500);
  }

  restorePlayer() {
    const p = G.player;
    if (p) {
      p.hp = p.maxHp;
      p.mana = p.maxMana;
      p.castLock = 0;
      p.invuln = 0;
      p.dead = false;
      p.targetable = true;
      floatText(p.x, p.y, 45, 'Restored!', '#4fd65a', 14);
    }
  }

  cancelDuel(reason = 'Duel cancelled.', duelId = null) {
    if (duelId && this.activeDuel?.duelId !== duelId) return;
    this._clearTimers();
    if (this.activeDuel?.opponentId) {
      const rp = this._findRemotePlayer(this.activeDuel.opponentId);
      if (rp) rp.isDuelOpponent = false;
    }
    const wasInDuel = !!this.activeDuel;
    this.activeDuel = null;
    this.clearPrompt();
    this.clearBanner();
    if (wasInDuel) {
      this.restorePlayer();
      if (G.world?.kind === 'arena') {
        G.game?.enterTown();
      }
    }
    UI.log(reason, '#ffd34a');
  }
}

export const DuelManager = new DuelManagerClass();

export function initDuel() {
  if (DuelManager._initialized || !net?.on) return;
  DuelManager._initialized = true;
  net.on('duel_prompt', (data) => DuelManager.handleDuelPrompt(data));
  net.on('duel_start', (data) => DuelManager.startDuel(data));
  net.on('duel_hit', (data) => DuelManager.handleDuelHit(data));
  net.on('duel_summon_hit', (data) => DuelManager.handleDuelSummonHit(data));
  net.on('duel_end', (data) => DuelManager.endDuel(data));
  net.on('duel_cancel', (data) => DuelManager.cancelDuel(data.reason, data.duelId));
}

// Deferred initialization fallback
if (typeof setTimeout !== 'undefined') {
  setTimeout(() => { try { initDuel(); } catch (e) {} }, 0);
}

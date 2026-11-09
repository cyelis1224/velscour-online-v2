// Velscour Online - Player Context Menu in Town
// Opens on right-click (or long press) over another player in town.
// Provides: Add/Remove Friend, Trade, Mute/Unmute, Duel, and Whisper.

import { G } from '../state.js';
import { el, escapeHtml } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { net } from '../net/network.js';
import { MuteManager } from '../net/mutemanager.js';
import { CLASSES } from '../data/classes.js';
import { TradeManager } from './trade.js';
import { DuelManager } from '../game/duel.js';

let activeMenuEl = null;
let activeTargetId = null;

export function remotePlayerAt(sx, sy) {
  if (!G.remotePlayers) return null;
  let best = null;
  let bd = Infinity;
  for (const rp of G.remotePlayers.values()) {
    if (!rp || rp.dead || !rp.sbox) continue;
    const [x0, y0, x1, y1] = rp.sbox;
    const pad = 12;
    if (sx >= x0 - pad && sx <= x1 + pad && sy >= y0 - pad && sy <= y1 + pad) {
      const d = Math.hypot((x0 + x1) / 2 - sx, (y0 + y1) / 2 - sy);
      if (d < bd) {
        bd = d;
        best = rp;
      }
    }
  }
  return best;
}

export function isPlayerContextMenuOpen() {
  return !!activeMenuEl && document.body.contains(activeMenuEl);
}

export function closePlayerContextMenu() {
  if (activeMenuEl) {
    activeMenuEl.remove();
    activeMenuEl = null;
    activeTargetId = null;
  }
}

export function openPlayerContextMenu(rp, screenX, screenY) {
  closePlayerContextMenu();
  if (!rp || !rp.name) return;

  activeTargetId = rp.id;
  sfx('ui');

  const menu = el('div', 'player-context-menu');
  const clsName = CLASSES[rp.classId]?.name || rp.classId || 'Hero';
  const isMuted = MuteManager.isMuted(rp.name);
  const isFriend = Array.isArray(net.friends) && net.friends.some((f) => f && f.name && f.name.toLowerCase() === rp.name.toLowerCase());

  menu.innerHTML = `
    <div class="pcm-header">
      <div class="pcm-name">${escapeHtml(rp.name)}</div>
      <div class="pcm-sub">Lv ${rp.level || 1} ${escapeHtml(clsName)}</div>
    </div>
    <div class="pcm-divider"></div>
    <div class="pcm-actions">
      <button type="button" class="pcm-item" data-action="friend">
        <span class="pcm-icon">👤</span>
        <span class="pcm-label">${isFriend ? 'Remove Friend' : 'Add Friend'}</span>
      </button>
      <button type="button" class="pcm-item" data-action="trade">
        <span class="pcm-icon">⚖️</span>
        <span class="pcm-label">Trade</span>
      </button>
      <button type="button" class="pcm-item" data-action="mute">
        <span class="pcm-icon">${isMuted ? '🔊' : '🔇'}</span>
        <span class="pcm-label">${isMuted ? 'Unmute' : 'Mute'}</span>
      </button>
      <button type="button" class="pcm-item pcm-item-duel" data-action="duel">
        <span class="pcm-icon">⚔️</span>
        <span class="pcm-label">Duel</span>
      </button>
      <div class="pcm-divider"></div>
      <button type="button" class="pcm-item" data-action="whisper">
        <span class="pcm-icon">💬</span>
        <span class="pcm-label">Whisper</span>
      </button>
    </div>
  `;

  // Item clicks
  menu.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    sfx('ui');
    closePlayerContextMenu();

    if (action === 'friend') {
      if (isFriend) {
        net.removeFriend(rp.name);
      } else {
        net.addFriend(rp.name);
      }
    } else if (action === 'trade') {
      TradeManager.requestTrade(rp);
    } else if (action === 'mute') {
      const nowMuted = MuteManager.toggle(rp.name);
      if (typeof window !== 'undefined' && window.GameChat && window.GameChat.addSystemLog) {
        window.GameChat.addSystemLog(
          nowMuted
            ? `Muted <b style="color:#ffd34a">${escapeHtml(rp.name)}</b>. You will no longer see their chats.`
            : `Unmuted <b style="color:#ffd34a">${escapeHtml(rp.name)}</b>.`,
          nowMuted ? '#ff9999' : '#8fe0ff'
        );
      }
    } else if (action === 'duel') {
      DuelManager.requestDuel(rp);
    } else if (action === 'whisper') {
      if (typeof window !== 'undefined' && window.GameChat && window.GameChat.focus) {
        window.GameChat.focus(`/w ${rp.name} `);
      }
    }
  });

  document.body.appendChild(menu);
  activeMenuEl = menu;

  // Clamped positioning to fit within screen bounds
  const rect = menu.getBoundingClientRect();
  const pad = 12;
  const left = Math.max(pad, Math.min(screenX, window.innerWidth - rect.width - pad));
  const top = Math.max(pad, Math.min(screenY, window.innerHeight - rect.height - pad));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;

  // Dismiss listeners
  const onPointerDown = (ev) => {
    if (activeMenuEl && !activeMenuEl.contains(ev.target)) {
      closePlayerContextMenu();
      cleanup();
    }
  };

  const onKeyDown = (ev) => {
    if (ev.key === 'Escape') {
      closePlayerContextMenu();
      cleanup();
    }
  };

  function cleanup() {
    window.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('keydown', onKeyDown, true);
  }

  // Delay attaching pointerdown to prevent immediate dismissal on initial right-click
  setTimeout(() => {
    if (activeMenuEl) {
      window.addEventListener('pointerdown', onPointerDown, true);
      window.addEventListener('keydown', onKeyDown, true);
    }
  }, 50);
}

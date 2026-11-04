// Velscour Online - Friends List UI
import { net } from '../net/network.js';
import { el, escapeHtml } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { G } from '../state.js';

let friendsModalEl = null;
let addFriendDialogEl = null;
let activeListeners = null;
let pollInterval = null;

const CLASS_DISPLAY_NAMES = {
  paladin: 'Paladin',
  barbarian: 'Barbarian',
  sorceress: 'Sorceress',
  amazon: 'Amazon',
  assassin: 'Assassin',
  necromancer: 'Necromancer',
  druid: 'Druid',
  runeblade: 'Runeblade',
  deathknight: 'Death Knight',
  bard: 'Bard',
  priestess: 'Priestess',
  lancer: 'Lancer',
  monk: 'Monk',
};

export function isFriendsOpen() {
  return !!friendsModalEl && document.body.contains(friendsModalEl);
}

export function triggerWhisper(targetName) {
  sfx('ui');
  closeFriendsDialog();
  if (G.mode === 'lobby') {
    const chatInput = document.querySelector('.d2-chat-input-bar .d2-input') || document.querySelector('#d2-lobby .d2-input');
    if (chatInput) {
      chatInput.value = `/w ${targetName} `;
      chatInput.focus();
    }
  } else if (typeof window !== 'undefined' && window.GameChat && window.GameChat.focus) {
    window.GameChat.focus(`/w ${targetName} `);
  }
}

export function closeFriendsDialog() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  if (addFriendDialogEl) {
    addFriendDialogEl.remove();
    addFriendDialogEl = null;
  }
  if (friendsModalEl) {
    friendsModalEl.remove();
    friendsModalEl = null;
  }
  if (activeListeners) {
    net.off('friends_list', activeListeners.onFriendsList);
    net.off('friend_error', activeListeners.onFriendError);
    activeListeners = null;
  }
}

export function toggleFriends() {
  if (isFriendsOpen()) {
    closeFriendsDialog();
  } else {
    openFriendsDialog();
  }
}

export function openFriendsDialog() {
  closeFriendsDialog();
  sfx('ui');

  const overlay = el('div', 'd2-modal-overlay d2-friends-overlay');
  overlay.id = 'd2-friends-modal';

  const box = el('div', 'd2-friends-window');
  overlay.appendChild(box);

  // Top Title Bar
  const head = el('div', 'd2-friends-head');
  head.innerHTML = `
    <div class="d2-friends-title-wrap">
      <span class="d2-friends-title">FRIENDS LIST</span>
      <span class="d2-friends-stats" id="d2-friends-count">Loading…</span>
    </div>
    <div class="d2-friends-actions">
      <button type="button" class="d2-btn-classic small" id="d2-friends-add-btn">+ ADD FRIEND</button>
      <button type="button" class="d2-btn-classic small close" id="d2-friends-close-btn" aria-label="Close">✕</button>
    </div>
  `;
  box.appendChild(head);

  // Friends Scrollable List
  const listEl = el('div', 'd2-friends-list');
  listEl.id = 'd2-friends-list-container';
  box.appendChild(listEl);

  // Footer info / commands help
  const foot = el('div', 'd2-friends-foot');
  foot.innerHTML = `
    <span class="dim">Chat commands: <b style="color:#ffd34a">/f add &lt;name&gt;</b> · <b style="color:#ffd34a">/f remove &lt;name&gt;</b> · <b style="color:#ffd34a">/f list</b></span>
  `;
  box.appendChild(foot);

  // Wire close & add buttons
  head.querySelector('#d2-friends-close-btn').onclick = () => {
    sfx('ui');
    closeFriendsDialog();
  };
  head.querySelector('#d2-friends-add-btn').onclick = () => {
    sfx('ui');
    openAddFriendModal();
  };

  // Close when clicking outside window
  overlay.addEventListener('pointerdown', (e) => {
    if (e.target === overlay) {
      sfx('ui');
      closeFriendsDialog();
    }
  });

  const countEl = head.querySelector('#d2-friends-count');

  function renderList(friends) {
    const prevScroll = listEl.scrollTop;
    listEl.innerHTML = '';
    const arr = Array.isArray(friends) ? friends : [];
    const onlineCount = arr.filter(f => f.online).length;
    countEl.textContent = `${onlineCount} / ${arr.length} Online`;

    if (arr.length === 0) {
      listEl.innerHTML = `
        <div class="d2-friends-empty">
          <p>Your friends list is currently empty.</p>
          <p class="dim" style="font-size:12px;margin-top:6px;">Click <b>+ ADD FRIEND</b> above or type <b>/f add &lt;name&gt;</b> in chat to add fellow adventurers!</p>
        </div>
      `;
      return;
    }

    for (const f of arr) {
      const row = el('div', `d2-friend-row ${f.online ? 'online' : 'offline'}`);
      const clsName = CLASS_DISPLAY_NAMES[f.classId] || f.classId || 'Hero';

      // Status indicator
      const dot = el('span', `d2-friend-dot ${f.online ? 'online' : 'offline'}`);
      dot.title = f.online ? 'Online' : 'Offline';

      // Friend Details
      const info = el('div', 'd2-friend-info');
      const nameRow = el('div', 'd2-friend-name-row');
      const nameEl = el('span', 'd2-friend-name', escapeHtml(f.name));
      nameEl.title = `Click to whisper ${f.name}`;
      nameEl.style.cursor = 'pointer';
      nameEl.onclick = () => triggerWhisper(f.name);

      const detailsEl = el('span', 'd2-friend-meta', `Lv ${f.level || 1} ${escapeHtml(clsName)}`);
      nameRow.append(nameEl, detailsEl);

      // Location badge
      let locHtml = '<span class="d2-friend-loc offline">Offline</span>';
      if (f.online) {
        if (f.status === 'room' && f.roomName) {
          locHtml = `<span class="d2-friend-loc room">Game: "<b>${escapeHtml(f.roomName)}</b>"</span>`;
        } else {
          locHtml = `<span class="d2-friend-loc lobby">Lobby</span>`;
        }
      }
      const locEl = el('div', 'd2-friend-loc-wrap');
      locEl.innerHTML = locHtml;

      info.append(nameRow, locEl);

      // Action buttons
      const actions = el('div', 'd2-friend-row-actions');

      // Whisper button (always available so users can quickly initiate chat / whisper)
      const whisperBtn = el('button', `d2-btn-classic small ${f.online ? 'whisper-online' : 'whisper-offline'}`, 'Whisper');
      whisperBtn.title = `Whisper ${f.name} (/w ${f.name})`;
      whisperBtn.onclick = () => triggerWhisper(f.name);
      actions.appendChild(whisperBtn);

      // Join game button (if online in a room and player is in lobby)
      if (f.online && f.status === 'room' && f.roomName && G.mode === 'lobby') {
        const joinBtn = el('button', 'd2-btn-classic small join', 'Join');
        joinBtn.title = `Join ${f.name}'s game (${f.roomName})`;
        joinBtn.onclick = () => {
          sfx('ui');
          closeFriendsDialog();
          net.joinRoom(f.roomName);
        };
        actions.appendChild(joinBtn);
      }

      // Remove button
      const removeBtn = el('button', 'd2-btn-classic small red', '✕');
      removeBtn.title = `Remove ${f.name} from friends`;
      removeBtn.onclick = () => {
        sfx('ui');
        if (confirm(`Remove ${f.name} from your friends list?`)) {
          net.removeFriend(f.name);
        }
      };
      actions.appendChild(removeBtn);

      row.append(dot, info, actions);
      listEl.appendChild(row);
    }

    listEl.scrollTop = prevScroll;
  }

  // Network event hooks
  const onFriendsList = (friends) => {
    if (friendsModalEl) renderList(friends);
  };
  const onFriendError = (errMsg) => {
    alert(errMsg || 'Friend action failed.');
  };

  activeListeners = { onFriendsList, onFriendError };
  net.on('friends_list', onFriendsList);
  net.on('friend_error', onFriendError);

  // Active polling while modal is open so presence stays 100% synchronized in real time
  pollInterval = setInterval(() => {
    if (isFriendsOpen()) {
      net.requestFriendsList();
    }
  }, 2000);

  // Initial render from existing cache or request
  renderList(net.friends || []);
  net.requestFriendsList();

  friendsModalEl = overlay;
  document.body.appendChild(overlay);
}

export function openAddFriendModal() {
  if (addFriendDialogEl) addFriendDialogEl.remove();

  const wrap = el('div', 'd2-modal-overlay d2-add-friend-overlay');
  wrap.style.zIndex = '1100';

  const box = el('div', 'd2-add-friend-box');
  box.innerHTML = `
    <h3 class="d2-add-friend-title">ADD FRIEND</h3>
    <p class="dim" style="font-size:12px;margin:4px 0 12px;">Enter the exact character name of your friend:</p>
    <div class="d2-add-friend-input-wrap">
      <input type="text" class="d2-input" id="d2-add-friend-name" placeholder="Character Name" maxlength="18" autocomplete="off">
      <div class="d2-add-friend-err hidden" id="d2-add-friend-err"></div>
    </div>
    <div class="d2-add-friend-btns">
      <button type="button" class="d2-btn-classic" id="d2-add-friend-cancel">Cancel</button>
      <button type="button" class="d2-btn-classic" id="d2-add-friend-confirm" style="color:#ffd34a;">Add Friend</button>
    </div>
  `;
  wrap.appendChild(box);

  const input = box.querySelector('#d2-add-friend-name');
  const errEl = box.querySelector('#d2-add-friend-err');
  const cancelBtn = box.querySelector('#d2-add-friend-cancel');
  const confirmBtn = box.querySelector('#d2-add-friend-confirm');

  const close = () => {
    if (wrap.parentNode) wrap.remove();
    addFriendDialogEl = null;
  };

  const submit = () => {
    const val = input.value.trim();
    if (!val) {
      errEl.textContent = 'Please enter a character name.';
      errEl.classList.remove('hidden');
      input.focus();
      return;
    }
    sfx('ui');
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Adding…';
    net.addFriend(val);
    close();
  };

  cancelBtn.onclick = () => { sfx('ui'); close(); };
  confirmBtn.onclick = submit;
  input.onkeydown = (e) => {
    if (e.key === 'Enter') submit();
    if (e.key === 'Escape') close();
  };

  wrap.addEventListener('pointerdown', (e) => {
    if (e.target === wrap) close();
  });

  addFriendDialogEl = wrap;
  document.body.appendChild(wrap);
  setTimeout(() => { if (input.isConnected) input.focus(); }, 40);
}

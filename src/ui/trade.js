// Velscour Online - Trade Interface & Manager
// Handles peer-to-peer item & gold trading in town with anti-scam safeguards and atomic server transfers.

import { G } from '../state.js';
import { el, escapeHtml, fmtInt } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { UI, draggable, droppable } from './ui.js';
import { itemCell, itemTooltip, rarityClass } from './itemui.js';
import { renderInventory, changed } from './inventory.js';
import { net } from '../net/network.js';
import { addToBag } from '../game/player.js';

export const TRADE_SLOTS = 16; // 4x4 grid

class TradeManagerClass {
  constructor() {
    this.activeTrade = null;
    this.promptEl = null;
    this.promptTimer = null;
    this._recentChangeFlash = false;
  }

  isTrading() {
    return !!this.activeTrade;
  }

  requestTrade(partnerRp) {
    if (!partnerRp || !partnerRp.id) return;
    if (this.isTrading()) {
      UI.log('You are already in an active trade.', '#ff8080');
      return;
    }
    sfx('ui');
    net.send({
      type: 'trade_request',
      targetId: partnerRp.id,
      targetName: partnerRp.name,
    });
    UI.log(`Sent trade request to <b style="color:#ffd34a">${escapeHtml(partnerRp.name)}</b>...`, '#8fe0ff');
  }

  handleTradePrompt(data) {
    this.clearPrompt();
    sfx('ui');

    const prompt = el('div', 'trade-prompt-banner');
    prompt.innerHTML = `
      <div class="tpb-content">
        <span class="tpb-icon">⚖️</span>
        <span class="tpb-text"><b style="color:#ffd34a">${escapeHtml(data.fromName || 'Adventurer')}</b> invites you to trade.</span>
      </div>
      <div class="tpb-actions">
        <button type="button" class="btn small tpb-accept" id="tpb-accept">Accept</button>
        <button type="button" class="btn small tpb-decline" id="tpb-decline">Decline</button>
      </div>
    `;

    prompt.querySelector('#tpb-accept').onclick = () => {
      sfx('ui');
      this.clearPrompt();
      net.send({
        type: 'trade_respond',
        fromId: data.fromId,
        accept: true,
      });
    };

    prompt.querySelector('#tpb-decline').onclick = () => {
      sfx('ui');
      this.clearPrompt();
      net.send({
        type: 'trade_respond',
        fromId: data.fromId,
        accept: false,
      });
    };

    document.body.appendChild(prompt);
    this.promptEl = prompt;

    this.promptTimer = setTimeout(() => {
      this.clearPrompt();
      net.send({
        type: 'trade_respond',
        fromId: data.fromId,
        accept: false,
      });
    }, 25000);
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

  startTrade(data) {
    this.clearPrompt();
    sfx('ui');

    this.activeTrade = {
      tradeId: data.tradeId,
      partner: data.partner,
      myOffer: {
        items: Array(TRADE_SLOTS).fill(null),
        gold: 0,
        locked: false,
      },
      theirOffer: {
        items: Array(TRADE_SLOTS).fill(null),
        gold: 0,
        locked: false,
      },
    };

    UI.closeAll();
    UI.openPanel('trade', `Trading with ${data.partner.name}`, (body) => this.renderTradePanel(body), {
      onClose: () => this.cancelTrade('Trade closed.'),
      cls: 'trade-panel',
      width: '620px',
    });
    UI.openPanel('inventory', 'Your Inventory', renderInventory);
    UI.log(`Began trading with <b style="color:#ffd34a">${escapeHtml(data.partner.name)}</b>.`, '#8fe0ff');
  }

  renderTradePanel(body) {
    if (!this.activeTrade) return;
    const t = this.activeTrade;
    body.innerHTML = '';

    const wrap = el('div', 'trade-window-wrap');

    // Header info bar
    const infoBar = el('div', 'trade-infobar');
    infoBar.innerHTML = `
      <div class="trade-side-info my-side">
        <span class="trade-side-title">YOUR OFFER</span>
        <span class="trade-side-status ${t.myOffer.locked ? 'status-locked' : 'status-pending'}">
          ${t.myOffer.locked ? '✓ LOCKED' : 'OFFERING…'}
        </span>
      </div>
      <div class="trade-vs-badge">⇄</div>
      <div class="trade-side-info their-side">
        <span class="trade-side-title">${escapeHtml(t.partner.name).toUpperCase()}'S OFFER</span>
        <span class="trade-side-status ${t.theirOffer.locked ? 'status-locked' : 'status-pending'}">
          ${t.theirOffer.locked ? '✓ LOCKED' : 'OFFERING…'}
        </span>
      </div>
    `;
    wrap.appendChild(infoBar);

    // Columns wrapper
    const cols = el('div', 'trade-columns');

    // Left Column: My Offer
    const myCol = el('div', `trade-col my-offer-col ${t.myOffer.locked ? 'locked' : ''}`);
    const myGrid = el('div', 'trade-grid');
    for (let i = 0; i < TRADE_SLOTS; i++) {
      const it = t.myOffer.items[i];
      const slot = el('div', 'bslot trade-slot ' + rarityClass(it));
      if (it) {
        slot.appendChild(itemCell(it));
        UI.tip(slot, () => ({ html: itemTooltip(it, { hint: 'Right-click to remove from offer' }) }));
        slot.oncontextmenu = (e) => {
          e.preventDefault();
          this.removeItemFromOffer(i);
        };
        slot.onclick = () => {
          this.removeItemFromOffer(i);
        };
      }
      droppable(slot, (data) => this.handleDropOnTrade(i, data), (data) => data.type === 'item');
      myGrid.appendChild(slot);
    }
    myCol.appendChild(myGrid);

    // My Gold row
    const myGoldRow = el('div', 'trade-gold-row');
    myGoldRow.innerHTML = `
      <span class="gold-icon">◉</span>
      <input type="number" id="trade-my-gold" class="d2-input trade-gold-input" min="0" max="${G.char?.gold || 0}" value="${t.myOffer.gold}" ${t.myOffer.locked ? 'disabled' : ''} />
      <button type="button" class="btn small" id="trade-gold-max-btn" ${t.myOffer.locked ? 'disabled' : ''}>Max</button>
    `;
    const goldInput = myGoldRow.querySelector('#trade-my-gold');
    goldInput.onchange = () => {
      let val = parseInt(goldInput.value, 10) || 0;
      val = Math.max(0, Math.min(val, G.char?.gold || 0));
      goldInput.value = val;
      this.setOfferGold(val);
    };
    myGoldRow.querySelector('#trade-gold-max-btn').onclick = () => {
      const val = G.char?.gold || 0;
      goldInput.value = val;
      this.setOfferGold(val);
    };
    myCol.appendChild(myGoldRow);

    // My Accept Button
    const myActionRow = el('div', 'trade-action-row');
    const acceptBtn = el('button', `btn trade-accept-btn ${t.myOffer.locked ? 'active' : ''}`, t.myOffer.locked ? '✓ WAITING FOR PARTNER' : 'LOCK & ACCEPT');
    acceptBtn.onclick = () => {
      this.toggleLockOffer();
    };
    myActionRow.appendChild(acceptBtn);
    myCol.appendChild(myActionRow);

    cols.appendChild(myCol);

    // Right Column: Their Offer
    const theirCol = el('div', `trade-col their-offer-col ${t.theirOffer.locked ? 'locked' : ''}`);
    const theirGrid = el('div', 'trade-grid');
    for (let i = 0; i < TRADE_SLOTS; i++) {
      const it = t.theirOffer.items[i];
      const slot = el('div', 'bslot trade-slot ' + rarityClass(it));
      if (it) {
        slot.appendChild(itemCell(it));
        UI.tip(slot, () => ({ html: itemTooltip(it) }));
      }
      theirGrid.appendChild(slot);
    }
    theirCol.appendChild(theirGrid);

    // Their Gold row
    const theirGoldRow = el('div', 'trade-gold-row disabled');
    theirGoldRow.innerHTML = `
      <span class="gold-icon">◉</span>
      <span class="trade-partner-gold">${fmtInt(t.theirOffer.gold || 0)} Gold</span>
    `;
    theirCol.appendChild(theirGoldRow);

    // Their Status Display
    const theirStatusRow = el('div', 'trade-action-row');
    const theirStatusBox = el('div', `trade-partner-status-box ${t.theirOffer.locked ? 'accepted' : 'waiting'}`);
    theirStatusBox.textContent = t.theirOffer.locked ? `✓ ${t.partner.name} HAS ACCEPTED` : `Waiting for ${t.partner.name}…`;
    theirStatusRow.appendChild(theirStatusBox);
    theirCol.appendChild(theirStatusRow);

    cols.appendChild(theirCol);
    wrap.appendChild(cols);

    // Anti-scam helper notice
    const note = el('div', 'trade-security-note', 'Anti-Scam Protection: Any change in offered items or gold instantly resets acceptances.');
    wrap.appendChild(note);

    body.appendChild(wrap);
  }

  handleDropOnTrade(slotIndex, dragData) {
    if (!this.activeTrade || this.activeTrade.myOffer.locked) return false;
    if (dragData.type !== 'item' || dragData.where !== 'bag') return false;
    const it = G.char?.bag ? G.char.bag[dragData.idx] : null;
    if (!it) return false;

    // Check if item is locked
    if (it.locked) {
      UI.log('Item is locked. Unlock it before trading.', '#ffd34a');
      sfx('error');
      return false;
    }

    // Check if already in offer
    const alreadyIdx = this.activeTrade.myOffer.items.findIndex((item) => item && item.bagIndex === dragData.idx);
    if (alreadyIdx !== -1 && alreadyIdx !== slotIndex) {
      this.activeTrade.myOffer.items[alreadyIdx] = null;
    }

    const tradeItem = {
      ...it,
      bagIndex: dragData.idx,
    };
    this.activeTrade.myOffer.items[slotIndex] = tradeItem;
    this.onOfferModified();
    return true;
  }

  addItemToOffer(bagIndex) {
    if (!this.activeTrade || this.activeTrade.myOffer.locked) return false;
    const it = G.char?.bag ? G.char.bag[bagIndex] : null;
    if (!it) return false;
    if (it.locked) {
      UI.log('Item is locked. Unlock it before trading.', '#ffd34a');
      sfx('error');
      return false;
    }

    // Find empty slot
    const emptySlot = this.activeTrade.myOffer.items.findIndex((item) => !item);
    if (emptySlot === -1) {
      UI.log('Your trade window is full.', '#ffd34a');
      return false;
    }

    this.activeTrade.myOffer.items[emptySlot] = {
      ...it,
      bagIndex,
    };
    this.onOfferModified();
    return true;
  }

  removeItemFromOffer(slotIndex) {
    if (!this.activeTrade || this.activeTrade.myOffer.locked) return;
    if (!this.activeTrade.myOffer.items[slotIndex]) return;
    sfx('ui');
    this.activeTrade.myOffer.items[slotIndex] = null;
    this.onOfferModified();
  }

  setOfferGold(amount) {
    if (!this.activeTrade || this.activeTrade.myOffer.locked) return;
    this.activeTrade.myOffer.gold = amount;
    this.onOfferModified();
  }

  onOfferModified() {
    if (!this.activeTrade) return;
    sfx('ui');
    // Instantly reset lock states on change
    this.activeTrade.myOffer.locked = false;
    this.activeTrade.theirOffer.locked = false;

    // Send update to server
    net.send({
      type: 'trade_update',
      tradeId: this.activeTrade.tradeId,
      offer: {
        items: this.activeTrade.myOffer.items,
        gold: this.activeTrade.myOffer.gold,
      },
    });

    this.refreshPanel();
  }

  toggleLockOffer() {
    if (!this.activeTrade) return;
    sfx('ui');
    const newState = !this.activeTrade.myOffer.locked;
    this.activeTrade.myOffer.locked = newState;

    net.send({
      type: 'trade_lock',
      tradeId: this.activeTrade.tradeId,
      locked: newState,
    });

    this.refreshPanel();
  }

  handleRemoteUpdate(data) {
    if (!this.activeTrade || this.activeTrade.tradeId !== data.tradeId) return;
    sfx('ui');
    this.activeTrade.theirOffer.items = Array.isArray(data.offer?.items) ? data.offer.items : Array(TRADE_SLOTS).fill(null);
    this.activeTrade.theirOffer.gold = data.offer?.gold || 0;
    // Reset our lock because offer changed
    this.activeTrade.myOffer.locked = false;
    this.activeTrade.theirOffer.locked = false;
    this.refreshPanel();
  }

  handleRemoteLock(data) {
    if (!this.activeTrade || this.activeTrade.tradeId !== data.tradeId) return;
    sfx('ui');
    this.activeTrade.theirOffer.locked = !!data.locked;
    this.refreshPanel();
  }

  handleTradeComplete(data) {
    if (!this.activeTrade || this.activeTrade.tradeId !== data.tradeId) return;
    const c = G.char;
    if (!c) return;

    // Deduct my sent gold and add received gold
    const goldSent = Number(data.goldSent) || 0;
    const goldReceived = Number(data.goldReceived) || 0;
    c.gold = Math.max(0, (c.gold || 0) - goldSent + goldReceived);

    // Remove sent items from my bag
    const sentIndices = Array.isArray(data.sentBagIndices) ? data.sentBagIndices : [];
    for (const idx of sentIndices) {
      if (c.bag && c.bag[idx]) {
        c.bag[idx] = null;
      }
    }

    // Add received items to bag
    const receivedItems = Array.isArray(data.receivedItems) ? data.receivedItems : [];
    for (const item of receivedItems) {
      if (item) {
        // Strip temporary trade properties if any
        delete item.bagIndex;
        addToBag(c, item);
      }
    }

    // Clean up trade state
    const partnerName = this.activeTrade.partner.name;
    this.activeTrade = null;
    UI.closePanel('trade');
    changed();

    // Sound & feedback
    sfx('gold');
    sfx('portal');
    UI.log(`Trade with <b style="color:#ffd34a">${escapeHtml(partnerName)}</b> completed successfully!`, '#8fe0ff');

    // Trigger save
    if (net.sendCharacterSave) {
      net.sendCharacterSave(c);
    }
  }

  cancelTrade(reason = 'Trade cancelled.') {
    if (!this.activeTrade) return;
    const tradeId = this.activeTrade.tradeId;
    this.activeTrade = null;
    net.send({
      type: 'trade_cancel',
      tradeId,
      reason,
    });
    UI.closePanel('trade');
    UI.log(reason, '#ffd34a');
    sfx('ui');
  }

  handleRemoteCancel(data) {
    if (this.activeTrade && this.activeTrade.tradeId === data.tradeId) {
      this.activeTrade = null;
      UI.closePanel('trade');
      UI.log(data.reason || 'Trade was cancelled by the other player.', '#ffd34a');
      sfx('ui');
    }
  }

  refreshPanel() {
    const p = UI.panels.get('trade');
    if (p && p.body) {
      this.renderTradePanel(p.body);
    }
  }
}

export const TradeManager = new TradeManagerClass();

export function initTrade() {
  if (TradeManager._initialized || !net?.on) return;
  TradeManager._initialized = true;
  net.on('trade_prompt', (data) => TradeManager.handleTradePrompt(data));
  net.on('trade_start', (data) => TradeManager.startTrade(data));
  net.on('trade_update', (data) => TradeManager.handleRemoteUpdate(data));
  net.on('trade_lock', (data) => TradeManager.handleRemoteLock(data));
  net.on('trade_complete', (data) => TradeManager.handleTradeComplete(data));
  net.on('trade_cancel', (data) => TradeManager.handleRemoteCancel(data));
}

// Deferred initialization fallback
if (typeof setTimeout !== 'undefined') {
  setTimeout(() => { try { initTrade(); } catch (e) {} }, 0);
}

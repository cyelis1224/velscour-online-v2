// The six-tab Infernal Marks upgrade library.
import { G, saveSettings } from '../state.js';
import { el, escapeHtml, fmtInt } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { UI } from './ui.js';
import { endgame, MARK_CATS } from '../game/endgame.js';
import { CATS, INFERNAL_UPGRADES, MARK_CATEGORIES, INFERNAL_UPGRADE_BY_ID, bonusFor, purchaseCost, maxPurchasable, marksTotal, marksFree, marksIn, purchaseUpgrade, refundCost, refundUpgrade, resetMarks, autoSpend, capXp } from '../game/marks.js';
import { MAX_LEVEL } from '../game/player.js';
import { SKILLS } from '../data/skills.js';
import { skillIconURL } from './icons.js';
import { IMP_SPRITE_PATH } from '../data/treasureimps.js';

const fmt = (v) => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const defaultPanel = { x: null, y: null, w: 1080, h: 700, category: 'offensive', selected: 'might' };
const panelSettings = () => G.settings.markPanel ||= { ...defaultPanel };
function savePanel(p) {
  if (!p?.root?.isConnected || Marks.activePair) return;
  const s = panelSettings();
  const r = p.root.getBoundingClientRect(), host = UI.panelsEl.getBoundingClientRect();
  if (UI.desktopPanels()) { s.x = Math.max(0, r.left - host.left); s.y = Math.max(0, r.top - host.top); }
  s.w = Math.round(r.width); s.h = Math.round(r.height);
  saveSettings();
}
function iconFor(u, size = 54) {
  if (['impHunter', 'impFortune'].includes(u.id)) return `<img class="mk-icon" width="${size}" height="${size}" src="${IMP_SPRITE_PATH('treasure')}" alt="Treasure Imp">`;
  const skill = SKILLS[u.icon];
  if (skill) return `<img class="mk-icon" width="${size}" height="${size}" src="${skillIconURL(skill)}" alt="">`;
  const glyphs = { treasureHunter: '▣', riftHunter: '◉', riftSlayer: '✦', breachMastery: '◈' };
  return `<span class="mk-icon-glyph" aria-hidden="true">${glyphs[u.id] || '✦'}</span>`;
}
function totalBonus(u, rank) {
  const base = bonusFor(u.id, rank);
  return u.id === 'ferocity' ? base + (endgame().marks.legacyFerocity || 0) : base;
}
function displayBonus(u, v) { return `${fmt(v)} ${u.unit}`; }

export const Marks = {
  active: false,
  category: 'offensive',
  selected: 'might',
  quantity: 1,
  refundQuantity: 1,
  activePair: false,
  open({ keepExisting = false, paired = false } = {}) {
    if (!keepExisting) UI.closeAll();
    this.activePair = paired;
    const pref = panelSettings();
    this.category = MARK_CATEGORIES.some((x) => x.id === pref.category) ? pref.category : 'offensive';
    this.selected = INFERNAL_UPGRADE_BY_ID[pref.selected] ? pref.selected : INFERNAL_UPGRADES[0].id;
    this.quantity = 1; this.refundQuantity = 1; this.active = true; sfx('ui');
    const p = UI.openPanel('marks', 'Infernal Marks', (body, panel) => this.render(body, panel), {
      onClose: () => {
        const pairedWindow = this.activePair;
        this.active = false; this.activePair = false; savePanel(p);
        if (pairedWindow && UI.isOpen('heresies')) UI.closePanel('heresies');
      }, cls: 'marks-panel', width: 'min(1080px, 96vw)', layoutManaged: paired,
    });
    if (!paired) {
      p.root.style.width = `${Math.min(1080, Math.max(620, pref.w || defaultPanel.w), window.innerWidth * 0.96)}px`;
      p.root.style.height = `${Math.min(820, Math.max(500, pref.h || defaultPanel.h), window.innerHeight * 0.88)}px`;
      p.root.style.maxHeight = '88vh';
      if (Number.isFinite(pref.x) && Number.isFinite(pref.y) && UI.desktopPanels()) UI.placePanel('marks', pref.x, pref.y);
      else UI.layoutPanels();
    }
    p.head.title = 'Drag to move · resize from the lower-right corner';
    if (!p._marksPersist) {
      p._marksPersist = true;
      p.head.addEventListener('pointerup', () => savePanel(p));
      p.head.addEventListener('pointercancel', () => savePanel(p));
      if (typeof ResizeObserver !== 'undefined') {
        p._marksResize = new ResizeObserver(() => { if (this.active && !this.activePair && UI.panels.get('marks') === p) savePanel(p); });
        p._marksResize.observe(p.root);
      }
    }
    return p;
  },
  selectCategory(category) {
    if (!MARK_CATEGORIES.some((c) => c.id === category)) return;
    this.category = category;
    const p = panelSettings(); p.category = category;
    const rows = INFERNAL_UPGRADES.filter((u) => u.category === category);
    if (!rows.some((u) => u.id === this.selected)) this.selected = rows[0]?.id || 'might';
    p.selected = this.selected; saveSettings();
    UI.refresh();
  },
  moveCategory(step) {
    const index = MARK_CATEGORIES.findIndex((c) => c.id === this.category);
    this.selectCategory(MARK_CATEGORIES[(index + step + MARK_CATEGORIES.length) % MARK_CATEGORIES.length].id);
  },
  render(body, panel) {
    const pref = panelSettings(), m = endgame().marks;
    if (!MARK_CATEGORIES.some((c) => c.id === this.category)) this.category = pref.category || 'offensive';
    body.innerHTML = '';
    body.onkeydown = (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); this.moveCategory(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); this.moveCategory(1); }
    };
    body.tabIndex = 0;
    body.classList.add('mk-shell');
    const xpProgress = capXp(G.char), xp = xpProgress?.xp || 0, need = xpProgress?.need || 0, pct = need ? Math.min(100, xp / need * 100) : 0;
    body.appendChild(el('div', 'mk-head', `<div class="mk-summary"><div class="mk-tot"><b>${fmtInt(marksTotal())}</b><span>INFERNAL MARKS</span><small>${fmtInt(marksFree())} available</small></div><div class="mk-xp" title="${xpProgress ? `${fmtInt(xp)} / ${fmtInt(need)} XP` : `Experience-earned Marks begin at level ${MAX_LEVEL}`} "><i style="width:${pct.toFixed(1)}%"></i><span>${xpProgress ? `✦ ${fmtInt(xpProgress.earned)} earned · ${Math.floor(pct)}% · ${fmtInt(xp)} / ${fmtInt(need)} XP` : `✦ Experience-earned Marks begin at level ${MAX_LEVEL}`}</span></div></div><div class="mk-why">Experience-earned Marks are tracked per hero from level ${MAX_LEVEL} and join your account-wide balance. Spend Marks here after Velscour falls.</div>`));
    const nav = el('div', 'mk-nav');
    const prev = el('button', 'btn small mk-nav-arrow', '‹'); prev.title = 'Previous category'; prev.onclick = () => this.moveCategory(-1); nav.appendChild(prev);
    for (const cat of MARK_CATEGORIES) {
      const b = el('button', 'mk-tab' + (cat.id === this.category ? ' active' : ''), `<span>${cat.icon}</span><b>${escapeHtml(cat.name)}</b>`);
      b.setAttribute('aria-selected', cat.id === this.category ? 'true' : 'false'); b.onclick = () => this.selectCategory(cat.id); nav.appendChild(b);
    }
    const next = el('button', 'btn small mk-nav-arrow', '›'); next.title = 'Next category'; next.onclick = () => this.moveCategory(1); nav.appendChild(next);
    body.appendChild(nav);

    const work = el('div', 'mk-work');
    const grid = el('div', 'mk-grid');
    const rows = INFERNAL_UPGRADES.filter((u) => u.category === this.category);
    for (const u of rows) {
      const rank = marksIn(u.id), nextRank = rank + 1, cap = u.maxRank > 0;
      const current = totalBonus(u, rank), next = totalBonus(u, nextRank), cost = purchaseCost(u.id, rank, 1);
      const maxed = cap && rank >= u.maxRank, affordable = !maxed && cost <= marksFree();
      const rankText = cap ? `${rank} / ${u.maxRank}` : `Rank ${rank}`;
      const card = el('button', `mk-card${u.id === this.selected ? ' selected' : ''}${maxed ? ' maxed' : ''}`, `${iconFor(u, 44)}<span class="mk-card-main"><b>${escapeHtml(u.name)}</b><small>${maxed ? 'MAX RANK' : `Cost: ${fmtInt(cost)} Mark${cost === 1 ? '' : 's'}`}</small></span><span class="mk-rank-indicator">${rankText}</span>`);
      card.type = 'button'; card.title = `${u.name}: ${displayBonus(u, current)}${!maxed ? ` · Next: ${displayBonus(u, next)}` : ''}`;
      card.onclick = () => { this.selected = u.id; pref.selected = u.id; saveSettings(); UI.refresh(); };
      grid.appendChild(card);
    }
    work.appendChild(grid);

    const u = INFERNAL_UPGRADE_BY_ID[this.selected] || rows[0] || INFERNAL_UPGRADES[0];
    const rank = marksIn(u.id), maxed = u.maxRank > 0 && rank >= u.maxRank;
    const now = totalBonus(u, rank), after = totalBonus(u, rank + 1), rankDelta = after - now;
    const maximumBonus = u.maxRank > 0 ? totalBonus(u, u.maxRank) : null;
    const maxCount = maxPurchasable(u.id, rank, marksFree());
    const selectedQty = this.quantity === 'max' ? maxCount : Math.min(Number(this.quantity) || 1, maxCount);
    const cost = selectedQty ? purchaseCost(u.id, rank, selectedQty) : 0;
    const refundCount = this.refundQuantity === 'max' ? rank : Math.min(rank, Math.max(0, Number(this.refundQuantity) || 0));
    const refund = refundCount ? refundCost(u.id, refundCount) : 0;
    const detail = el('aside', 'mk-detail');
    detail.innerHTML = `<div class="mk-detail-icon" style="--mk-color:${CATS[u.id].color}">${iconFor(u, 74)}</div><h3>${escapeHtml(u.name)}</h3><div class="mk-rank">${u.maxRank > 0 ? `${rank} / ${u.maxRank}` : `Rank ${rank}`}</div><p class="mk-desc">${escapeHtml(u.description)}</p><div class="mk-total"><span>Current bonus</span><b>${displayBonus(u, now)}</b></div>${u.maxRank > 0 ? `<div class="mk-total"><span>Maximum bonus</span><b>${displayBonus(u, maximumBonus)}</b></div>` : ''}${maxed ? '<div class="mk-max">Maximum rank reached</div>' : `<div class="mk-total mk-next-total"><span>Next rank total</span><b>${displayBonus(u, after)}</b></div><div class="mk-gain">Next rank adds ${fmt(rankDelta)} ${escapeHtml(u.unit)}</div>`}<div class="mk-buy-qty"><span>Buy ranks</span>${[1,5,10,'max'].map((q) => `<button type="button" class="btn small${this.quantity === q ? ' active' : ''}" data-q="${q}">${q === 'max' ? 'Max' : q}</button>`).join('')}</div><div class="mk-price">${selectedQty ? `Total cost: <b>${fmtInt(cost)} Mark${cost === 1 ? '' : 's'}</b>` : 'No affordable ranks available'}</div><button class="btn red mk-purchase" ${!selectedQty || maxed ? 'disabled' : ''}>Purchase ${selectedQty || ''} rank${selectedQty === 1 ? '' : 's'}</button><section class="mk-refund"><div class="mk-refund-title">Refund ranks</div><div class="mk-refund-qty">${[1,5,10,'max'].map((q) => `<button type="button" class="btn small${this.refundQuantity === q ? ' active' : ''}" data-refund-q="${q}">${q === 'max' ? 'MAX' : q}</button>`).join('')}</div><div class="mk-refund-total">Refund: <b>${fmtInt(refund)} Mark${refund === 1 ? '' : 's'}</b></div><button class="btn small mk-refund-button" ${!refundCount ? 'disabled' : ''}>Refund Ranks</button></section>`;
    detail.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => { this.quantity = b.dataset.q === 'max' ? 'max' : Number(b.dataset.q); UI.refresh(); }));
    detail.querySelectorAll('[data-refund-q]').forEach((b) => b.addEventListener('click', () => { this.refundQuantity = b.dataset.refundQ === 'max' ? 'max' : Number(b.dataset.refundQ); UI.refresh(); }));
    const buy = detail.querySelector('.mk-purchase');
    buy?.addEventListener('click', () => {
      const n = this.quantity === 'max' ? maxPurchasable(u.id, marksIn(u.id), marksFree()) : Math.min(Number(this.quantity) || 1, maxPurchasable(u.id, marksIn(u.id), marksFree()));
      const price = purchaseCost(u.id, marksIn(u.id), n);
      if (!n || price > marksFree()) return;
      UI.dialog({ title: 'Confirm Infernal Mark purchase', html: `Purchase <b>${n}</b> rank${n === 1 ? '' : 's'} of <b>${escapeHtml(u.name)}</b> for <b>${fmtInt(price)} Infernal Marks</b>?<br><span class="dim">${fmtInt(marksFree() - price)} Marks will remain.</span>`, buttons: [{ label: 'Purchase', cls: 'red', fn: () => { const done = purchaseUpgrade(u.id, n); if (done) { sfx('levelup', 0.5); this.quantity = 1; UI.refresh(); } } }, { label: 'Cancel' }] });
    });
    detail.querySelector('.mk-refund-button')?.addEventListener('click', () => {
      const currentRank = marksIn(u.id);
      const n = this.refundQuantity === 'max' ? currentRank : Math.min(currentRank, Math.max(0, Number(this.refundQuantity) || 0));
      const amount = refundCost(u.id, n);
      if (!n || !amount) return;
      UI.dialog({ title: 'Confirm rank refund', html: `Refund <b>${n}</b> rank${n === 1 ? '' : 's'} of <b>${escapeHtml(u.name)}</b> for <b>${fmtInt(amount)} Infernal Marks</b>?<br><span class="dim">The full amount originally spent on these ranks will be returned to your available Marks.</span>`, buttons: [{ label: 'Refund Ranks', cls: 'red', fn: () => { const result = refundUpgrade(u.id, n); if (result) { this.refundQuantity = 1; sfx('ui'); UI.refresh(); } } }, { label: 'Cancel' }] });
    });
    work.appendChild(detail);
    body.appendChild(work);

    const foot = el('div', 'mk-foot');
    const spend = el('button', 'btn small', 'Spend all (best value)'); spend.disabled = marksFree() < 1; spend.onclick = () => { autoSpend(); sfx('levelup', 0.4); UI.refresh(); };
    const reset = el('button', 'btn small', 'Reset upgrades'); reset.disabled = !MARK_CATS.some((id) => marksIn(id)); reset.onclick = () => UI.dialog({ title: 'Reset Infernal Mark upgrades?', html: 'All purchased upgrade ranks will be refunded to your available Marks. This does not remove earned Marks.', buttons: [{ label: 'Reset upgrades', cls: 'red', fn: () => { resetMarks(); sfx('ui'); UI.refresh(); } }, { label: 'Cancel' }] });
    foot.append(spend, reset, el('span', 'dim mk-foot-note', 'Upgrade costs rise with each rank. Effects use their normal gameplay caps and eligibility.'));
    if (this.activePair) {
      const resetWindows = el('button', 'btn small', 'Reset window positions');
      resetWindows.onclick = () => { UI.resetPairedPanelPositions(); sfx('ui'); };
      foot.insertBefore(resetWindows, foot.lastChild);
    }
    body.appendChild(foot);
    savePanel(panel);
  },
};

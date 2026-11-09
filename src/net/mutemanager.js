// Velscour Online - Player Mute Manager
// Persists muted players locally and filters out whispers, chat channels, and overhead speech.

const STORAGE_KEY = 'velscour_muted_players';

class MuteManagerClass {
  constructor() {
    this._muted = new Set();
    this._load();
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          this._muted = new Set(list.map((n) => String(n).trim().toLowerCase()).filter(Boolean));
        }
      }
    } catch (e) {
      this._muted = new Set();
    }
  }

  _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...this._muted]));
    } catch (e) {}
  }

  isMuted(name) {
    if (!name) return false;
    return this._muted.has(String(name).trim().toLowerCase());
  }

  mute(name) {
    const clean = String(name || '').trim();
    if (!clean) return false;
    this._muted.add(clean.toLowerCase());
    this._save();
    return true;
  }

  unmute(name) {
    const clean = String(name || '').trim();
    if (!clean) return false;
    const deleted = this._muted.delete(clean.toLowerCase());
    if (deleted) this._save();
    return deleted;
  }

  toggle(name) {
    if (this.isMuted(name)) {
      this.unmute(name);
      return false;
    } else {
      this.mute(name);
      return true;
    }
  }

  getList() {
    return [...this._muted];
  }
}

export const MuteManager = new MuteManagerClass();

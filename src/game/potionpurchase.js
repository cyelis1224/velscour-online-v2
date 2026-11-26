export const POTION_BELT_CAPACITY = 30;
export const POTION_KINDS = Object.freeze(['hp', 'mp', 'rejuv', 'fury']);

const potionAvailabilityVersions = new WeakMap();
const potionAvailabilityCache = new WeakMap();

/** The single capacity source used by pickup, purchase, and ground-label rules. */
export function potionCapacity(_character, _kind) {
  return POTION_BELT_CAPACITY;
}

/** Call after a capacity-affecting stat/equipment recomputation. */
export function invalidatePotionAvailability(character) {
  if (character && typeof character === 'object') {
    potionAvailabilityVersions.set(character, (potionAvailabilityVersions.get(character) || 0) + 1);
  }
}

/** Change potion counts through this helper so cached ground-label eligibility stays current. */
export function setPotionCounts(character, updates) {
  if (!character || !updates || typeof updates !== 'object') return false;
  character.potions ||= {};
  let changed = false;
  for (const [kind, value] of Object.entries(updates)) {
    if (!POTION_KINDS.includes(kind) || !Number.isFinite(Number(value))) continue;
    character.potions[kind] = Number(value);
    changed = true;
  }
  if (changed) invalidatePotionAvailability(character);
  return changed;
}

export function changePotionCount(character, kind, amount) {
  if (!POTION_KINDS.includes(kind) || !Number.isFinite(Number(amount))) return false;
  const current = Number(character?.potions?.[kind]) || 0;
  return setPotionCounts(character, { [kind]: current + Number(amount) });
}

/** Cached once per count/capacity change, then a constant-time lookup per label pass. */
export function potionLabelCanCollect(character, kind) {
  if (!character || !POTION_KINDS.includes(kind)) return true;
  const version = potionAvailabilityVersions.get(character) || 0;
  let entry = potionAvailabilityCache.get(character);
  if (!entry || entry.version !== version) {
    const available = Object.create(null);
    for (const potionKind of POTION_KINDS) {
      const held = Math.max(0, Number(character.potions?.[potionKind]) || 0);
      available[potionKind] = held < potionCapacity(character, potionKind);
    }
    entry = { version, available };
    potionAvailabilityCache.set(character, entry);
  }
  return entry.available[kind];
}

/** Quote one fixed purchase or an all-or-nothing purchase to belt capacity. */
export function potionPurchaseQuote(current, gold, unitPrice, requested = 'max', capacity = POTION_BELT_CAPACITY) {
  const held = Math.max(0, Number(current) || 0);
  const maxCapacity = Math.max(0, Math.floor(Number(capacity) || 0));
  const available = Math.max(0, maxCapacity - held);
  const quantity = requested === 'max' ? available : Math.max(0, Math.floor(Number(requested) || 0));
  const total = Math.max(0, Math.ceil(Number(unitPrice) || 0)) * quantity;
  return {
    quantity,
    total,
    remaining: available,
    canBuy: quantity > 0 && quantity <= available && Number(gold) >= total,
  };
}

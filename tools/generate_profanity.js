// Tools: Generate Profanity Wordlist & Filtering Utilities from @coffeeandfun/google-profanity-words
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pkgDataDir = path.join(root, 'node_modules', '@coffeeandfun', 'google-profanity-words', 'data');

if (!fs.existsSync(pkgDataDir)) {
  console.error('Error: @coffeeandfun/google-profanity-words data directory not found at', pkgDataDir);
  process.exit(1);
}

const terms = new Set();
const files = fs.readdirSync(pkgDataDir);

for (const file of files) {
  if (file.endsWith('.txt')) {
    const content = fs.readFileSync(path.join(pkgDataDir, file), 'utf8');
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const term = line.trim().toLowerCase();
      if (term) {
        terms.add(term);
      }
    }
  }
}

// Fantasy RPG context & common benign gamer/English words to exclude from blanket blocking
const ALLOWLIST = new Set([
  'hell',   // Fantasy biome, spells, lore (Hellfire, Gates of Hell, Hellhound)
  'butt',   // Weapon butt (butt of spear/staff)
  'fool',   // Common RPG card/trope/dialogue (Fool's gold, etc.)
  'pawn',   // Chess piece / pawn shop
  'xx',     // Classic gamer tag decoration (e.g. xx_Shadow_xx)
  'dumb',   // Mild expression ("dumb luck")
  'lust',   // Mild emotion / sin attribute
]);

for (const w of ALLOWLIST) {
  terms.delete(w);
}

const sortedTerms = Array.from(terms).sort((a, b) => {
  // Sort multi-word phrases first (longest first)
  const aMulti = a.includes(' ') || a.includes('-') || a.includes('_');
  const bMulti = b.includes(' ') || b.includes('-') || b.includes('_');
  if (aMulti && !bMulti) return -1;
  if (!aMulti && bMulti) return 1;
  return b.length - a.length || a.localeCompare(b);
});

console.log(`Processed ${sortedTerms.length} profanity terms from @coffeeandfun/google-profanity-words.`);

function buildCoreLogicSource() {
  return `
const RAW_TERMS = ${JSON.stringify(sortedTerms)};

const PHRASE_TERMS = [];
const SINGLE_TERMS = new Set();

for (let i = 0; i < RAW_TERMS.length; i++) {
  const term = RAW_TERMS[i];
  if (term.includes(' ') || term.includes('-') || term.includes('_')) {
    PHRASE_TERMS.push(term);
  } else {
    SINGLE_TERMS.add(term);
  }
}

function normalizeLeet(str) {
  if (!str) return '';
  return str
    .replace(/@/g, 'a')
    .replace(/\\$/g, 's')
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/!/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/\\+/g, 't');
}

/**
 * Checks if a string contains any profanity (phrases or words).
 */
function isProfane(text) {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase();

  for (let i = 0; i < PHRASE_TERMS.length; i++) {
    const phrase = PHRASE_TERMS[i];
    if (lower.includes(phrase)) return true;
  }

  const words = lower.match(/[\\p{L}\\p{N}!$@+]+/gu) || [];
  for (let i = 0; i < words.length; i++) {
    const rawMatch = words[i];
    const core = rawMatch.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '').toLowerCase();
    if (!core) continue;
    if (SINGLE_TERMS.has(core)) return true;
    const leet = normalizeLeet(core);
    if (SINGLE_TERMS.has(leet)) return true;
  }

  return false;
}

/**
 * Returns a list of unique detected profanity words in the string.
 */
function getProfaneWords(text) {
  if (!text || typeof text !== 'string') return [];
  const found = new Set();
  const lower = text.toLowerCase();

  for (let i = 0; i < PHRASE_TERMS.length; i++) {
    const phrase = PHRASE_TERMS[i];
    if (lower.includes(phrase)) {
      found.add(phrase);
    }
  }

  const words = lower.match(/[\\p{L}\\p{N}!$@+]+/gu) || [];
  for (let i = 0; i < words.length; i++) {
    const rawMatch = words[i];
    const core = rawMatch.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '').toLowerCase();
    if (!core) continue;
    if (SINGLE_TERMS.has(core)) {
      found.add(core);
      continue;
    }
    const leet = normalizeLeet(core);
    if (SINGLE_TERMS.has(leet)) {
      found.add(core);
    }
  }

  return Array.from(found);
}

/**
 * Replaces profane words with asterisks while preserving casing and punctuation.
 */
function censorText(text) {
  if (!text || typeof text !== 'string') return text;
  let result = text;

  // 1. Multi-word phrases
  for (let i = 0; i < PHRASE_TERMS.length; i++) {
    const phrase = PHRASE_TERMS[i];
    const escaped = phrase.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&').replace(/[- _]+/g, '[- _]+');
    const regex = new RegExp('\\\\b' + escaped + '\\\\b', 'gi');
    result = result.replace(regex, (m) => '*'.repeat(m.length));
  }

  // 2. Single words and leetspeak
  result = result.replace(/[\\p{L}\\p{N}!$@+]+/gu, (match) => {
    const leadingMatch = match.match(/^[^a-zA-Z0-9]+/);
    const trailingMatch = match.match(/[^a-zA-Z0-9]+$/);
    const leading = leadingMatch ? leadingMatch[0] : '';
    const trailing = trailingMatch ? trailingMatch[0] : '';
    const core = match.slice(leading.length, match.length - trailing.length);
    if (!core) return match;

    const lower = core.toLowerCase();
    if (SINGLE_TERMS.has(lower) || SINGLE_TERMS.has(normalizeLeet(lower))) {
      return leading + '*'.repeat(core.length) + trailing;
    }
    return match;
  });

  return result;
}

/**
 * Comprehensive character / room name profanity check.
 * Checks direct matches, camelCase splits, delimiter splits, and leetspeak.
 */
function isProfaneName(rawName) {
  if (!rawName || typeof rawName !== 'string') return false;
  const raw = rawName.trim();
  if (!raw) return false;

  const lower = raw.toLowerCase();
  const leet = normalizeLeet(lower);

  // 1. Direct match
  if (SINGLE_TERMS.has(lower) || SINGLE_TERMS.has(leet)) return true;
  for (let i = 0; i < PHRASE_TERMS.length; i++) {
    if (lower === PHRASE_TERMS[i] || leet === PHRASE_TERMS[i]) return true;
  }

  // 2. Delimiter & number splitting (e.g. Lord_Asshole, Bitch123, sir-fuck)
  const tokens = lower.split(/[\\s_\\-.'0-9]+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (SINGLE_TERMS.has(tok)) return true;
    const lTok = normalizeLeet(tok);
    if (SINGLE_TERMS.has(lTok)) return true;
  }

  // 3. CamelCase splitting (e.g. LordAsshole -> Lord, Asshole)
  const camelTokens = raw.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/\\s+/).filter(Boolean);
  for (let i = 0; i < camelTokens.length; i++) {
    const tok = camelTokens[i];
    if (SINGLE_TERMS.has(tok)) return true;
    const lTok = normalizeLeet(tok);
    if (SINGLE_TERMS.has(lTok)) return true;
  }

  // 4. Substring check for terms >= 4 characters on stripped name
  const stripped = lower.replace(/[^a-z0-9]/g, '');
  const strippedLeet = leet.replace(/[^a-z0-9]/g, '');
  for (const term of SINGLE_TERMS) {
    if (term.length >= 4) {
      if (stripped.includes(term) || strippedLeet.includes(term)) {
        // Protect common innocent fantasy substrings
        if (term === 'ass' && (stripped.includes('assassin') || stripped.includes('classic') || stripped.includes('passage'))) {
          continue;
        }
        return true;
      }
    }
  }

  return false;
}

/**
 * Validates a character name for length, characters, and profanity.
 */
function validateCharName(rawName) {
  const name = String(rawName || '').trim().replace(/\\s+/g, ' ');
  if (name.length < 2) {
    return { valid: false, name, error: 'Character name must be at least 2 characters.' };
  }
  if (name.length > 18) {
    return { valid: false, name, error: 'Character name must be 18 characters or fewer.' };
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9 _'-]*$/.test(name)) {
    return { valid: false, name, error: 'Name may only contain letters, numbers, spaces, hyphens, or apostrophes.' };
  }
  if (isProfaneName(name)) {
    return { valid: false, name, error: 'Character name contains inappropriate or prohibited language.' };
  }
  return { valid: true, name, nameLower: name.toLowerCase(), error: null };
}
`;
}

// Write ESM version for client (src/net/profanity.js)
const esmContent = `// Velscour Online - Profanity Filter & Name Sanitizer (Client ESM)
// Sourced from @coffeeandfun/google-profanity-words
${buildCoreLogicSource()}
export {
  RAW_TERMS as PROFANITY_WORDS,
  isProfane,
  getProfaneWords,
  censorText,
  isProfaneName,
  validateCharName,
};
`;

const esmPath = path.join(root, 'src', 'net', 'profanity.js');
fs.writeFileSync(esmPath, esmContent, 'utf8');
console.log('Wrote ESM module:', esmPath);

// Write CJS version for server (src/net/profanity.cjs)
const cjsContent = `// Velscour Online - Profanity Filter & Name Sanitizer (Server CommonJS)
// Sourced from @coffeeandfun/google-profanity-words
${buildCoreLogicSource()}
module.exports = {
  PROFANITY_WORDS: RAW_TERMS,
  isProfane,
  getProfaneWords,
  censorText,
  isProfaneName,
  validateCharName,
};
`;

const cjsPath = path.join(root, 'src', 'net', 'profanity.cjs');
fs.writeFileSync(cjsPath, cjsContent, 'utf8');
console.log('Wrote CJS module:', cjsPath);

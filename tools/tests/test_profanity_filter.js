// Automated test suite for profanity filtering & character name validation
const {
  isProfane,
  getProfaneWords,
  censorText,
  isProfaneName,
  validateCharName,
} = require('../../src/net/profanity.cjs');

console.log('--- Testing Chat Censorship & Profanity Detection ---');

const chatTests = [
  {
    input: 'Hello adventurers!',
    expectedProfane: false,
    expectedCensored: 'Hello adventurers!',
  },
  {
    input: 'What the fuck is going on here?',
    expectedProfane: true,
    expectedCensored: 'What the **** is going on here?',
  },
  {
    input: 'You are an asshole and a bitch!',
    expectedProfane: true,
    expectedCensored: 'You are an ******* and a *****!',
  },
  {
    input: 'Shut up b!tch',
    expectedProfane: true,
    expectedCensored: 'Shut up *****',
  },
  {
    input: 'Eat sh1t and die',
    expectedProfane: true,
    expectedCensored: 'Eat **** and die',
  },
  {
    input: 'The assassin used their class ability to cross the passage of grass.',
    expectedProfane: false,
    expectedCensored: 'The assassin used their class ability to cross the passage of grass.',
  },
  {
    input: 'Hell yeah brother!',
    expectedProfane: false,
    expectedCensored: 'Hell yeah brother!',
  },
  {
    input: '2 girls 1 cup is disgusting',
    expectedProfane: true,
    expectedCensored: '************* is disgusting',
  },
];

let chatFailures = 0;
for (const test of chatTests) {
  const profane = isProfane(test.input);
  const censored = censorText(test.input);
  if (profane !== test.expectedProfane) {
    console.error(`FAIL isProfane("${test.input}"): expected ${test.expectedProfane}, got ${profane}`);
    chatFailures++;
  }
  if (censored !== test.expectedCensored) {
    console.error(`FAIL censorText("${test.input}"):\n  Expected: "${test.expectedCensored}"\n  Got:      "${censored}"`);
    chatFailures++;
  }
}

console.log('--- Testing Character Name Filtering ---');

const nameTests = [
  // Benign names
  { name: 'Paladin', valid: true },
  { name: 'Sir_Lancelot', valid: true },
  { name: 'Gandalf', valid: true },
  { name: 'Cassandra', valid: true },
  { name: 'Assassin', valid: true },
  { name: 'Hellfire', valid: true },
  { name: 'xx_Shadow_xx', valid: true },
  { name: 'DeathKnight', valid: true },
  { name: 'DemonHunter', valid: true },
  // Profane / obscene names
  { name: 'Bitch', valid: false },
  { name: 'b1tch', valid: false },
  { name: 'B!tch', valid: false },
  { name: 'Asshole', valid: false },
  { name: 'Lord_Asshole', valid: false },
  { name: 'SuperBitch', valid: false },
  { name: 'FuckYou', valid: false },
  { name: 'ShitHead', valid: false },
  { name: 'D1ck', valid: false },
  { name: 'Cunt_Destroyer', valid: false },
  { name: 'PussyCat', valid: false },
  { name: 'bitch123', valid: false },
  { name: 'sir-fuck', valid: false },
];

let nameFailures = 0;
for (const test of nameTests) {
  const v = validateCharName(test.name);
  if (v.valid !== test.valid) {
    console.error(`FAIL validateCharName("${test.name}"): expected valid=${test.valid}, got valid=${v.valid} (error: ${v.error})`);
    nameFailures++;
  }
}

if (chatFailures === 0 && nameFailures === 0) {
  console.log(`\nAll tests passed successfully! (${chatTests.length} chat tests, ${nameTests.length} name tests)`);
  process.exit(0);
} else {
  console.error(`\nTest failures: ${chatFailures} chat, ${nameFailures} name`);
  process.exit(1);
}

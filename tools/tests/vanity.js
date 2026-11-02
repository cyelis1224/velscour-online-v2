// Vanity looks: head/body/weapon/offhand pieces worn as looks in a 2x2 grid show on the hero (sprite + inventory portrait)
// Weapons & off-hands require matching base types (e.g. sword for sword, shield cannot vanity a tambourine).
// "Hide helmet" drops helmet from look, looks survive save round trips, and taking them off returns them to bag.
// node tools/tests/vanity.js [mobile]
const { openGame, report } = require('./harness');
const mobile = process.argv.includes('mobile');
(async () => {
  const { browser, page, errors } = await openGame(mobile ? { width: 844, height: 390, mobile: true } : {});
  const r = await page.evaluate(async () => {
    const { G, game } = window.DAGYR;
    await game.newChar('paladin', 'Peacock');
    const { rollItem, shownEquip } = await import('/src/data/items.js');
    const { addToBag } = await import('/src/game/player.js');
    const { wearLook, takeOffLook, toggleInventory, toggleCharacter, getItem } = await import('/src/ui/inventory.js');
    const { migrate } = await import('/src/game/save.js');
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const c = G.char, p = G.player, out = {};
    for (let i = 0; i < 40 && !p.artFrame(); i++) await wait(100);
    // Equip base sword and shield on paladin to test weapon/offhand vanity
    const eqSword = rollItem(20, { slot: 'weapon', base: 'sword' });
    const eqShield = rollItem(20, { slot: 'offhand', base: 'shield' });
    c.equip.weapon = eqSword;
    c.equip.offhand = eqShield;
    p.recompute();

    const stats = () => JSON.stringify([p.maxHp, p.st.armor, p.st.res, p.st.dmgPct, p.st.critChance]);
    const s0 = stats(), img0 = p.artFrame()?.img;

    const head = rollItem(60, { slot: 'head', rarity: 5 });
    const body = rollItem(60, { slot: 'body', rarity: 5 });
    const vanitySword = rollItem(60, { slot: 'weapon', base: 'sword', rarity: 5 });
    const mismatchMace = rollItem(60, { slot: 'weapon', base: 'mace', rarity: 5 });
    const mismatchDrum = rollItem(60, { slot: 'offhand', base: 'drum', rarity: 5 });
    const vanityShield = rollItem(60, { slot: 'offhand', base: 'shield', rarity: 5 });

    head.req = body.req = vanitySword.req = mismatchMace.req = mismatchDrum.req = vanityShield.req = 60; // no level gate on looks
    addToBag(c, head); addToBag(c, body);
    addToBag(c, vanitySword); addToBag(c, mismatchMace);
    addToBag(c, mismatchDrum); addToBag(c, vanityShield);

    out.wornHead = wearLook(c.bag.indexOf(head));
    out.wornBody = wearLook(c.bag.indexOf(body));

    // Test weapon matching rule:
    // Mismatch mace for equipped sword must fail
    out.mismatchWeaponRejected = wearLook(c.bag.indexOf(mismatchMace)) === false;
    // Matching sword for equipped sword must succeed
    out.matchingWeaponAccepted = wearLook(c.bag.indexOf(vanitySword)) === true;

    // Test offhand matching rule:
    // Mismatch drum for equipped shield must fail
    out.mismatchOffhandRejected = wearLook(c.bag.indexOf(mismatchDrum)) === false;
    // Matching shield for equipped shield must succeed
    out.matchingOffhandAccepted = wearLook(c.bag.indexOf(vanityShield)) === true;

    out.inBag = c.bag.includes(head) || c.bag.includes(body) || c.bag.includes(vanitySword) || c.bag.includes(vanityShield);
    out.statsSame = stats() === s0;
    out.shown = shownEquip(c).body === body && shownEquip(c).head === head &&
                shownEquip(c).weapon === vanitySword && shownEquip(c).offhand === vanityShield &&
                c.equip.body !== body && c.equip.weapon === eqSword && c.equip.offhand === eqShield;
    out.selRef = !!getItem({ where: 'vanity', slot: 'body' });
    await wait(600);
    const img1 = p.artFrame()?.img;
    out.spriteChanged = !!img1 && img1 !== img0;
    c.hideHelm = true;
    out.hiddenHead = shownEquip(c).head === null && c.vanity.head === head;

    const back = migrate(JSON.parse(JSON.stringify(c)));
    out.saved = back.vanity.body?.uid === body.uid && back.vanity.head?.uid === head.uid &&
                back.vanity.weapon?.uid === vanitySword.uid && back.vanity.offhand?.uid === vanityShield.uid &&
                back.hideHelm === true;
    const old = migrate(Object.assign(JSON.parse(JSON.stringify(c)), { vanity: undefined, hideHelm: undefined }));
    out.oldSave = old.vanity.head === null && old.vanity.body === null &&
                  old.vanity.weapon === null && old.vanity.offhand === null && old.hideHelm === false;
    c.hideHelm = false;

    toggleInventory();
    toggleCharacter();
    await wait(400);
    out.slotsInUi = document.querySelectorAll('.vanity-row .vslot').length;
    out.portraitShown = !!document.querySelector('.paperdoll .portrait img')?.src;
    return out;
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `tools/tests/out/vanity${mobile ? '_mobile' : ''}.png` });
  const r2 = await page.evaluate(async () => {
    const { G } = window.DAGYR;
    const { takeOffLook } = await import('/src/ui/inventory.js');
    const { shownEquip } = await import('/src/data/items.js');
    const c = G.char, body = c.vanity.body, wep = c.vanity.weapon;
    const offBody = takeOffLook('body') && c.bag.includes(body) && !c.vanity.body && shownEquip(c).body === c.equip.body;
    const offWep = takeOffLook('weapon') && c.bag.includes(wep) && !c.vanity.weapon && shownEquip(c).weapon === c.equip.weapon;
    return { takenOff: offBody && offWep };
  });
  Object.assign(r, r2);
  console.log(JSON.stringify(r));
  const bad = Object.entries(r).filter(([k, v]) => (k === 'inBag' ? v : k === 'slotsInUi' ? v !== 4 : !v));
  if (bad.length) { console.log('FAIL', JSON.stringify(bad)); process.exitCode = 1; } else console.log('PASS');
  report(errors); await browser.close();
})();

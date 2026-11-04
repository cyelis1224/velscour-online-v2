# VELSCOUR ChatGPT armor kit

**5 new body armors at a time for one class.** One template per class (`templates/<class>_armor_template.png`): the class's hero (armor 001) on the left with its name, one good example armor (a Legendary, armor 068) under it, and five empty frames for the new armors. The guide lines run straight from the reference across the frames: top of the head (cyan), feet (yellow), and the head anchor cross the helmets are fitted to.

In game each armor is one still frame, 128 x 192, facing right, unhelmed: helmets are separate items drawn over the head, and the face, hair and skin are kept out of the armor's palette swaps. That is why the head must not change.

| File | Size | What |
|---|---|---|
| `templates/<class>_armor_template.png` (16) | 1536 x 1024 | reference + example + 5 empty frames at 2x |
| `examples/<class>_armor_example.png` (16) | 1536 x 1024 | the same sheet with five of the class's armors filled in |
| `classes_overview.png` | 1024 x 954 | every class: hero and example side by side |
| `armor_names_template.json` | | class, and name + rarity for each of the five |

## Step 0: paste this first (style bible)

Open a new chat, attach nothing, paste:

```text
We are making art for VELSCOUR, a retro isometric pixel-art action RPG in the style of Diablo II
(dark fantasy, grimdark, gothic). Everything is seen from the game's 3/4 isometric camera, slightly from above.

Rules for every image I ask for:
- Crisp, detailed pixel-art sprites with hard edges, a dark muted palette, light from the upper left.
  Match the attached EXAMPLE's rendering style, level of detail and size in the frame exactly.
- Follow the attached TEMPLATE exactly: same 1536x1024 canvas, same grid, same cell order. The cyan dashed
  boxes are bounding outlines: fit the art inside them. Feet stand on the yellow ground line.
- The hero faces RIGHT (three-quarter view towards screen right).
- Background: pure flat magenta #FF00FF everywhere (or real transparency). No shadows on the ground, no floor,
  no gradients, no glow that bleeds far outside the creature. Sprites never touch each other or the cell edges.
- Remove ALL guide marks from your output: no cyan or yellow lines, no labels, no numbers, no text, no borders.
- Every cell is a different design unless I say otherwise; keep one consistent style across all sheets.
Reply "ready" and wait for the first sheet.
```

## Step 1: the sheet (one class per message)

Attach the class's template and example, then paste (the class lines below give the hero's look):

```text
Sheet: 5 NEW BODY ARMORS for the [CLASS]. Attached: template and example. 1536x1024, keep the left column
(class reference and good example) untouched. In each of the five frames draw the SAME hero as the
CLASS REFERENCE: [class line]. Same face, hair, bare head, body proportions, neutral standing pose
and three-quarter facing-right angle; top of the head on the cyan line, feet on the yellow line, head
centred on the cyan cross. Only the outfit changes: five structurally different armors (not recolours):
[1 = ..., 2 = ..., 3 = ..., 4 = ..., 5 = ...]. Vary pauldrons, breastplates, cloth and leather cuts, belts,
gauntlets, greaves. No helmet, hood, hat or crown, no weapons, no shield, empty hands. Same pixel style and
detail as the good example. Flat magenta background, no text in the frames.
```

Ask for rarities in the brackets if you like: Common = patched, plain; Uncommon = sturdier; Rare = fitted, trimmed; Epic = ornate; Legendary = ceremonial, glowing details; Mythic = otherworldly.

### Class lines

| Class | Hero |
|---|---|
| Arcane Sorcerer | brown-haired bearded man; violet armored battle robe, amethyst inlays and engraved bronze |
| Barbarian | muscular red-haired woman; rugged riveted iron, hide, fur shoulder mantle, reinforced boots |
| Bard | curly dark-haired bearded man; burgundy reinforced traveling coat, brass ornaments and charcoal trousers |
| Boomerang Knight | short black-haired woman; teal and bronze articulated plate, crescent and return-arc motifs |
| Carrion Witch | pale long grey-haired woman; crow-feather mantle, ragged charcoal robes, ossuary charms and weathered iron |
| Death Knight | pale man with close-cropped black hair; blackened articulated plate, cold-blue inlay and purple cloth; NO built-in helmet |
| Dragon Knight | auburn-haired woman; red-copper articulated dragon scale armor, dark wine cloth; NO built-in helmet |
| Dragoon | black-haired man; angular blue steel, wing-shaped plate edges and burgundy cloth |
| Gunner | dark-haired moustached man; charcoal reinforced long coat, brass buckles and dark red scarf; NO goggles on head |
| Lancer | large broad man with short brown hair; heavy charcoal steel plate and brass trim, fortress-shaped pauldrons; NO built-in helmet |
| Necromancer | pale bald man; ash-black armored coat, bone clasps, mauve sash, ossuary motifs |
| Paladin | dark-skinned bearded man; sun-themed silver segmented plate, aged gold trim and navy cloth |
| Ranger | red-haired woman; forest leather, leaf-shaped lamellar, dark green cloak and bronze buckles |
| Slime Lord | a humanoid of cold translucent cobalt-blue slime with a bare rounded slime head; muted steel and bronze armor and purple textiles |
| Totem Master | brown-skinned long dark-haired man; bronze and moss leather, carved guardian totems and charms |
| Wizard | silver-haired man; midnight blue layered robe, astrolabe and star embroidery, protective bracers |

## Step 2: the names file

```text
Fill in this JSON: "class" (the id from the list), and for each of the five armors, in order, "name"
and "rarity" (common, uncommon, rare, epic, legendary or mythic). Reply with the JSON only.
```

## Importing the result

Save ChatGPT's image and the filled-in names file, then from the repository root:

```bash
python tools/chatgpt_art.py armor <image.png> <names.json> --dry   # cut only: look at tools/tests/out/chatgpt_art/preview.png
python tools/chatgpt_art.py armor <image.png> <names.json>
```
`chatgpt_art.py` is in this zip too (it lives in `tools/`). It needs `pip install pillow numpy scipy`.

The importer scales each armor so its head and feet sit exactly where the class's hero has them, saves `assets/source/gear_additions/<class>/<class>_armor_NNN_<rarity>.png` (numbered from 81) and reruns `python tools/process_assets.py gear <class>`. New armors drop alongside the zip's armors of the same rarity (`extra` in `gear.json`). Check with `node tools/tests/gear.js <class>`.

## Check the reply before importing

- Same 3:2 canvas (1536 x 1024), same number of cells, nothing in the wrong cell.
- Background flat magenta, no floor or shadow under the art, no labels or guide lines left over.
- Nothing touching a neighbour or crossing a cell edge (the importer gives each cell the art whose centre is in it).
- If one cell is wrong, ask: "Redraw only cell N, keep everything else pixel-identical."

- The face must match the reference. If it drifted, ask ChatGPT to "keep the head from the class reference exactly" and redraw.

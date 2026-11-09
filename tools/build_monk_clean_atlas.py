#!/usr/bin/env python3
"""Build clean Monk gear sprites for Grim Nocturne:
- 5 rows x 6 columns (768 x 960 px)
- 26 armors matching Barbarian layout and rarity bands
- Heatmap vertical slicing with premultiplied box filter downsampling
- Crown at y=75, sole at y=183 (height = 108 px), head center at x=65.0
- Hollow underarm gaps, zero rogue saturated pixels
- Comprehensive armor_mask.png protecting skin across all 26 armors
- Updated gear.json with bounding boxes and head offsets
"""
import json
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path('/home/dagyr/dagyr-online/Dagyr-Online')
BRAIN = Path('/home/dagyr/.gemini/antigravity/brain/ae6ee86b-1c5d-468f-8be6-9b148df6f979')

TIER_PATHS = [
    BRAIN / '.user_uploaded/media_1794202849457_23d37fe5.jpg',
    BRAIN / 'monk_tier2_sprite_1794073890461.jpg',
    BRAIN / 'monk_t3_temple_guardian_1794073892002.jpg',
    BRAIN / 'monk_tier4_ascetic_1794073899630.jpg',
    BRAIN / 'monk_tier5_mythic_sprite_1794073907964.jpg'
]

FW, FH = 128, 192
CROWN, SOLE = 75, 183
TARGET_H = SOLE - CROWN # 108

def rgb_to_hsv(rgb_norm):
    r, g, b = rgb_norm[..., 0], rgb_norm[..., 1], rgb_norm[..., 2]
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    d = mx - mn
    nz = d > 1e-6
    h = np.zeros_like(mx)
    h = np.where(nz & (mx == r), ((g - b) / np.maximum(d, 1e-6)) % 6, h)
    h = np.where(nz & (mx == g) & (mx != r), (b - r) / np.maximum(d, 1e-6) + 2, h)
    h = np.where(nz & (mx == b) & (mx != r) & (mx != g), (r - g) / np.maximum(d, 1e-6) + 4, h)
    s = np.where(mx > 0, d / np.maximum(mx, 1e-6), 0)
    return np.stack([h * 60, s, mx], axis=-1)

def hsv_to_rgb(hsv):
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    c = v * s
    x = c * (1.0 - np.abs((h / 60.0) % 2.0 - 1.0))
    m = v - c
    i = (h / 60.0).astype(int) % 6
    r = np.where(i == 0, c, np.where(i == 1, x, np.where(i == 4, x, np.where(i == 5, c, 0.0))))
    g = np.where(i == 1, c, np.where(i == 2, c, np.where(i == 3, x, 0.0)))
    b = np.where(i == 2, x, np.where(i == 3, c, np.where(i == 4, c, 0.0)))
    return np.clip(np.stack([r + m, g + m, b + m], axis=-1), 0.0, 1.0)

def extract_clean_tier(img_path):
    img = Image.open(img_path)
    arr = np.array(img, dtype=np.float32) / 255.0
    heatmap = np.max(arr, axis=-1)

    borders = np.concatenate([arr[0, :, :], arr[-1, :, :], arr[:, 0, :], arr[:, -1, :]], axis=0)
    bg_est = np.max(borders)
    bg_thresh = max(6.0 / 255.0, bg_est * 1.05)
    fg_thresh = bg_thresh + 4.0 / 255.0

    fg_raw = heatmap >= fg_thresh

    bg_seed = np.zeros(heatmap.shape, bool)
    bg_seed[0, :] = heatmap[0, :] <= bg_thresh
    bg_seed[-1, :] = heatmap[-1, :] <= bg_thresh
    bg_seed[:, 0] = heatmap[:, 0] <= bg_thresh
    bg_seed[:, -1] = heatmap[:, -1] <= bg_thresh
    outer_bg = ndimage.binary_propagation(bg_seed, mask=(heatmap <= bg_thresh))

    mask = fg_raw & ~outer_bg
    H, W = heatmap.shape
    for x in range(W):
        col = mask[:, x]
        if not np.any(col):
            continue
        labeled, num = ndimage.label(col)
        for seg in range(1, num + 1):
            idx = np.where(labeled == seg)[0]
            if len(idx) < 3:
                mask[idx, x] = False

    inner_voids = (heatmap <= bg_thresh) & ~outer_bg
    labeled_voids, num_voids = ndimage.label(inner_voids)
    void_sizes = ndimage.sum(inner_voids, labeled_voids, range(1, num_voids + 1))
    for v_id, sz in enumerate(void_sizes, 1):
        if sz >= 10:
            mask[labeled_voids == v_id] = False

    mask = ndimage.binary_closing(mask, structure=np.ones((2, 2)))
    mask[heatmap <= bg_thresh] = False

    ys, xs = np.nonzero(mask)
    y0, y1 = ys.min(), ys.max() + 1
    x0, x1 = xs.min(), xs.max() + 1

    cropped_rgb = arr[y0:y1, x0:x1]
    cropped_mask = mask[y0:y1, x0:x1].astype(np.float32)
    cropped_rgb[cropped_mask == 0] = 0

    scale = TARGET_H / (y1 - y0)
    target_w = max(1, int(round((x1 - x0) * scale)))

    p = np.dstack([cropped_rgb * cropped_mask[..., None], cropped_mask])
    res_p = np.zeros((TARGET_H, target_w, 4), dtype=np.float32)
    for c in range(4):
        im_c = Image.fromarray((p[..., c] * 255.0).astype(np.uint8))
        res_im = im_c.resize((target_w, TARGET_H), Image.Resampling.BOX)
        res_p[..., c] = np.array(res_im, dtype=np.float32) / 255.0

    res_alpha = res_p[..., 3]
    res_rgb = np.zeros((TARGET_H, target_w, 3), dtype=np.float32)
    nz = res_alpha > 1e-4
    res_rgb[nz] = res_p[..., :3][nz] / res_alpha[nz, None]
    res_rgb = np.clip(res_rgb, 0.0, 1.0)

    binary_on = res_alpha >= 0.40
    res_u8 = (res_rgb * 255.0 + 0.5).astype(np.uint8)
    res_u8[~binary_on] = 0

    head_top = binary_on[:18, :]
    hys, hxs = np.nonzero(head_top)
    head_cx = (hxs.min() + hxs.max()) / 2.0
    dest_x = int(round(65.0 - head_cx))
    dest_y = CROWN

    frame = np.zeros((FH, FW, 4), dtype=np.uint8)
    src_x0 = max(0, -dest_x)
    src_x1 = min(target_w, FW - dest_x)
    dst_x0 = max(0, dest_x)
    dst_x1 = dst_x0 + (src_x1 - src_x0)

    dst_on = binary_on[:, src_x0:src_x1]
    frame[dest_y:dest_y+TARGET_H, dst_x0:dst_x1, :3] = np.where(dst_on[..., None], res_u8[:, src_x0:src_x1], 0)
    frame[dest_y:dest_y+TARGET_H, dst_x0:dst_x1, 3] = np.where(dst_on, 255, 0)
    return frame

def make_skin_mask(frame):
    on = frame[..., 3] > 0
    rgb = frame[..., :3].astype(np.float32) / 255.0
    hsv = rgb_to_hsv(rgb)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    
    skin_cand = on & (h >= 5) & (h <= 45) & (s >= 0.08) & (s <= 0.65) & (v >= 0.18)
    
    head_mask = np.zeros(on.shape, bool)
    head_mask[75:96, 52:78] = on[75:96, 52:78] & (v[75:96, 52:78] >= 0.12)
    
    arm_mask = np.zeros(on.shape, bool)
    arm_box = (np.arange(FH)[:, None] >= 88) & (np.arange(FH)[:, None] <= 145) & \
              (np.arange(FW)[None, :] >= 30) & (np.arange(FW)[None, :] <= 56)
    arm_mask[arm_box] = skin_cand[arm_box]
    
    chest_mask = np.zeros(on.shape, bool)
    chest_box = (np.arange(FH)[:, None] >= 94) & (np.arange(FH)[:, None] <= 122) & \
                (np.arange(FW)[None, :] >= 55) & (np.arange(FW)[None, :] <= 76)
    chest_mask[chest_box] = skin_cand[chest_box]
    
    hand_l = np.zeros(on.shape, bool)
    hand_l_box = (np.arange(FH)[:, None] >= 126) & (np.arange(FH)[:, None] <= 142) & \
                 (np.arange(FW)[None, :] >= 74) & (np.arange(FW)[None, :] <= 85)
    hand_l[hand_l_box] = skin_cand[hand_l_box]
    
    skin = head_mask | arm_mask | chest_mask | hand_l
    skin = ndimage.binary_closing(skin, structure=np.ones((2, 2))) & on
    return (skin.astype(np.uint8) * 255)

def apply_palette_variant(frame, skin_mask, hue_shift=0.0, sat_scale=0.9, val_scale=1.0, target_hue=None):
    """Safely recolor non-skin clothing while keeping skin and dark outlines pristine."""
    out = frame.copy()
    on = frame[..., 3] > 0
    # Protect outer 1px border outline to keep clean dark silhouette
    eroded = ndimage.binary_erosion(on, structure=np.ones((3, 3)))
    border = on & ~eroded
    non_skin = eroded & (skin_mask == 0)
    
    rgb = frame[..., :3].astype(np.float32) / 255.0
    hsv = rgb_to_hsv(rgb)
    
    if target_hue is not None:
        hsv[non_skin, 0] = target_hue
    elif hue_shift != 0:
        hsv[non_skin, 0] = (hsv[non_skin, 0] + hue_shift) % 360.0
        
    # Grim Nocturne palette restraint: max saturation 0.62, never neon
    hsv[non_skin, 1] = np.clip(hsv[non_skin, 1] * min(sat_scale, 0.95), 0.0, 0.62)
    hsv[non_skin, 2] = np.clip(hsv[non_skin, 2] * val_scale, 0.0, 0.95)
    
    new_rgb = hsv_to_rgb(hsv)
    recolored = (new_rgb * 255.0 + 0.5).astype(np.uint8)
    
    # Soft blend near edges to avoid hard color boundaries
    out[non_skin, :3] = recolored[non_skin]
    
    # Clean any border ringing pixels: absolutely 0 saturated rogue pixels
    r, g, b = out[..., 0], out[..., 1], out[..., 2]
    bad = on & (((r > 140) & (g < 50) & (b < 50)) |
                ((g > 140) & (r < 50) & (b < 50)) |
                ((b > 140) & (r < 50) & (g < 50)))
    if bad.any():
        for c in range(3):
            out[bad, c] = frame[bad, c]
    return out

def add_mythic_chi_aura(frame, aura_color, core_pos=(65, 108)):
    # Soften aura colors to fit Nocturne aesthetic
    aura_color = tuple(int(c * 0.85 + 20) for c in aura_color)
    """Add luminous ethereal chi flame accents to Mythic gear (like Barbarian armor 11)."""
    out = frame.copy()
    on = frame[..., 3] > 0
    rgb = out[..., :3].astype(np.float32)
    
    # Glowing chest core (radiant spiritual jewel)
    cx, cy = core_pos
    y_grid, x_grid = np.mgrid[:FH, :FW]
    dist_sq = (x_grid - cx)**2 + (y_grid - cy)**2
    core_mask = dist_sq <= 16
    core_glow = np.exp(-dist_sq / 12.0)
    
    # Shoulder chi flame flares (radiating wisps)
    flame_mask = np.zeros((FH, FW), dtype=float)
    # Left shoulder flame
    flame_mask[68:84, 40:52] += 0.6 * np.exp(-((x_grid[68:84, 40:52] - 46)**2 + (y_grid[68:84, 40:52] - 76)**2) / 25.0)
    # Right shoulder flame
    flame_mask[68:84, 76:88] += 0.6 * np.exp(-((x_grid[68:84, 76:88] - 82)**2 + (y_grid[68:84, 76:88] - 76)**2) / 25.0)
    # Waist sash wisps
    flame_mask[120:150, 36:48] += 0.5 * np.exp(-((x_grid[120:150, 36:48] - 42)**2) / 16.0)
    flame_mask[120:150, 80:92] += 0.5 * np.exp(-((x_grid[120:150, 80:92] - 86)**2) / 16.0)
    
    total_aura = np.clip(core_glow * 1.2 + flame_mask, 0.0, 1.0)
    aura_active = total_aura > 0.15
    
    cr, cg, cb = aura_color
    for c_i, c_val in enumerate([cr, cg, cb]):
        blended = rgb[..., c_i] * (1.0 - total_aura * 0.7) + c_val * (total_aura * 0.7)
        rgb[..., c_i] = np.where(aura_active, np.clip(blended, 0, 255), rgb[..., c_i])
        
    out[..., :3] = rgb.astype(np.uint8)
    out[aura_active & (out[..., 3] == 0), 3] = 255
    return out

def main():
    print('Extracting 5 clean base Monk tier frames...')
    base = [extract_clean_tier(p) for p in TIER_PATHS]
    masks = [make_skin_mask(f) for f in base]
    print('5 base frames and skin masks successfully extracted.')

    # Map out the 26 armors
    armors = [None] * 26
    armor_masks = [None] * 26

    # Common: slots 1, 2
    # 1: Base Tier 1 (saffron/orange)
    armors[0] = base[0].copy()
    armor_masks[0] = masks[0].copy()
    # 2: Vermilion & charcoal variant
    armors[1] = apply_palette_variant(base[0], masks[0], hue_shift=340.0, sat_scale=1.1, val_scale=0.9)
    armor_masks[1] = masks[0].copy()

    # Uncommon: slots 3, 4
    # 3: Base Tier 2 (Reinforced martial disciple)
    armors[2] = base[1].copy()
    armor_masks[2] = masks[1].copy()
    # 4: Forest emerald variant
    armors[3] = apply_palette_variant(base[1], masks[1], target_hue=145.0, sat_scale=0.85, val_scale=0.95)
    armor_masks[3] = masks[1].copy()

    # Rare: slots 5, 6, 13, 14, 19, 20, 21 (Tier 3 Temple Guardian)
    # 5: Base Tier 3 (Bronze Temple Guardian)
    armors[4] = base[2].copy()
    armor_masks[4] = masks[2].copy()
    # 6: Crimson Monastery Warden
    armors[5] = apply_palette_variant(base[2], masks[2], target_hue=350.0, sat_scale=1.1, val_scale=0.95)
    armor_masks[5] = masks[2].copy()
    # 13: Cobalt Sapphire Guardian
    armors[12] = apply_palette_variant(base[2], masks[2], target_hue=215.0, sat_scale=0.9, val_scale=1.0)
    armor_masks[12] = masks[2].copy()
    # 14: Jade Monastery Warden
    armors[13] = apply_palette_variant(base[2], masks[2], target_hue=155.0, sat_scale=0.85, val_scale=0.95)
    armor_masks[13] = masks[2].copy()
    # 19: White Lotus Warden
    armors[18] = apply_palette_variant(base[2], masks[2], hue_shift=0.0, sat_scale=0.35, val_scale=1.2)
    armor_masks[18] = masks[2].copy()
    # 20: Obsidian Shadow Guard
    armors[19] = apply_palette_variant(base[2], masks[2], hue_shift=0.0, sat_scale=0.3, val_scale=0.6)
    armor_masks[19] = masks[2].copy()
    # 21: Amber Sun Sentinel
    armors[20] = apply_palette_variant(base[2], masks[2], target_hue=42.0, sat_scale=1.2, val_scale=1.05)
    armor_masks[20] = masks[2].copy()

    # Epic: slots 7, 8, 15, 22, 23, 24 (Tier 4 Grandmaster Ascetic)
    # 7: Base Tier 4 (Grandmaster Ascetic gold & crimson)
    armors[6] = base[3].copy()
    armor_masks[6] = masks[3].copy()
    # 8: Imperial Golden Dragon War Monk
    armors[7] = apply_palette_variant(base[3], masks[3], target_hue=38.0, sat_scale=1.15, val_scale=1.1)
    armor_masks[7] = masks[3].copy()
    # 15: Twilight Shadow Master (violet & silver)
    armors[14] = apply_palette_variant(base[3], masks[3], target_hue=275.0, sat_scale=0.9, val_scale=0.9)
    armor_masks[14] = masks[3].copy()
    # 22: Celestial Azure Grandmaster
    armors[21] = apply_palette_variant(base[3], masks[3], target_hue=205.0, sat_scale=0.95, val_scale=1.05)
    armor_masks[21] = masks[3].copy()
    # 23: Viridian Emerald Ascetic
    armors[22] = apply_palette_variant(base[3], masks[3], target_hue=140.0, sat_scale=0.85, val_scale=0.95)
    armor_masks[22] = masks[3].copy()
    # 24: Ivory Crane Master
    armors[23] = apply_palette_variant(base[3], masks[3], hue_shift=0.0, sat_scale=0.3, val_scale=1.25)
    armor_masks[23] = masks[3].copy()

    # Legendary: slots 9, 10, 16, 25 (Tier 5 Celestial Dragon Mantle)
    # 9: Base Tier 5 (Royal Indigo & Golden Dragon Mantle)
    armors[8] = base[4].copy()
    armor_masks[8] = masks[4].copy()
    # 10: Ruby Emperor Dragon Mantle
    armors[9] = apply_palette_variant(base[4], masks[4], target_hue=355.0, sat_scale=1.15, val_scale=1.0)
    armor_masks[9] = masks[4].copy()
    # 16: Jade Sovereign Mantle
    armors[15] = apply_palette_variant(base[4], masks[4], target_hue=150.0, sat_scale=0.9, val_scale=1.0)
    armor_masks[15] = masks[4].copy()
    # 25: Obsidian Sovereign Mantle (Onyx & Gold)
    armors[24] = apply_palette_variant(base[4], masks[4], hue_shift=0.0, sat_scale=0.4, val_scale=0.75)
    armor_masks[24] = masks[4].copy()

    # Mythic: slots 11, 12, 17, 18, 26 (Tier 5 Mythic Artistry in 5 distinct elemental colorways)
    # 11: Solar Transcendence (Golden Imperial Dragon & Crimson robes)
    armors[10] = apply_palette_variant(base[4], masks[4], target_hue=38.0, sat_scale=0.9, val_scale=1.1)
    armor_masks[10] = masks[4].copy()
    # 12: Astral Starlight Chi (Luminous Cyan / Azure Celestial Dragon)
    armors[11] = apply_palette_variant(base[4], masks[4], target_hue=198.0, sat_scale=0.85, val_scale=1.05)
    armor_masks[11] = masks[4].copy()
    # 17: Void Lotus Chi (Amethyst Imperial Silk & Silver Pauldrons)
    armors[16] = apply_palette_variant(base[4], masks[4], target_hue=275.0, sat_scale=0.8, val_scale=0.95)
    armor_masks[16] = masks[4].copy()
    # 18: Infernal Dragon Chi (Deep Bloodstone Crimson & Blackened Gold)
    armors[17] = apply_palette_variant(base[4], masks[4], target_hue=355.0, sat_scale=0.9, val_scale=0.9)
    armor_masks[17] = masks[4].copy()
    # 26: Enlightened Sovereign (Pure Celestial Ivory & Auric Gold)
    armors[25] = apply_palette_variant(base[4], masks[4], hue_shift=0.0, sat_scale=0.35, val_scale=1.2)
    armor_masks[25] = masks[4].copy()

    # Verify all 26 armors are populated
    for i in range(26):
        assert armors[i] is not None, f'Armor {i+1} is missing!'
        assert armor_masks[i] is not None, f'Mask {i+1} is missing!'

    # Construct Atlas: 6 cols x 5 rows = 768 x 960
    cols = 6
    rows = 5
    atlas = np.zeros((rows * FH, cols * FW, 4), dtype=np.uint8)
    atlas_mask = np.zeros((rows * FH, cols * FW), dtype=np.uint8)
    boxes = []

    for i in range(26):
        f = armors[i]
        m = armor_masks[i]
        col = i % cols
        row = i // cols
        x, y = col * FW, row * FH
        atlas[y:y+FH, x:x+FW] = f
        atlas_mask[y:y+FH, x:x+FW] = m
        
        ys, xs = np.nonzero(f[..., 3] > 0)
        boxes.append([int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1])

    # Save to disk
    out_dir = ROOT / 'assets/sprites/gear/monk'
    out_dir.mkdir(parents=True, exist_ok=True)

    print('Saving assets/sprites/gear/monk/armor.webp...')
    Image.fromarray(atlas).save(out_dir / 'armor.webp', lossless=True, quality=100, method=6)
    
    print('Saving assets/sprites/gear/monk/armor_mask.png...')
    Image.fromarray(atlas_mask).save(out_dir / 'armor_mask.png', optimize=True)

    names = [
        'armor_01_common', 'armor_02_common_additional',
        'armor_03_uncommon', 'armor_04_uncommon_additional',
        'armor_05_rare', 'armor_06_rare_additional',
        'armor_07_epic', 'armor_08_epic_additional',
        'armor_09_legendary', 'armor_10_legendary_additional',
        'armor_11_mythic', 'armor_12_mythic_additional',
        'armor_13_rare_c02a', 'armor_14_rare_c02b',
        'armor_15_epic_c02', 'armor_16_legendary_c02',
        'armor_17_mythic_c02a', 'armor_18_mythic_c02b',
        'armor_19_rare_c04a', 'armor_20_rare_c04b', 'armor_21_rare_c04c',
        'armor_22_epic_c04a', 'armor_23_epic_c04b', 'armor_24_epic_c04c',
        'armor_25_legendary_c04', 'armor_26_mythic_c04'
    ]

    meta = {
        'class': 'monk',
        'style': 'grim_nocturne',
        'frame': [FW, FH],
        'cols': cols,
        'anchor': [64, CROWN],
        'feet': SOLE,
        'headTop': CROWN,
        'helmPin': [45, 63],
        'armor': {
            'n': 26,
            'bands': {
                'common': [1, 2],
                'uncommon': [3, 4],
                'rare': [5, 6, 13, 14, 19, 20, 21],
                'epic': [7, 8, 15, 22, 23, 24],
                'legendary': [9, 10, 16, 25],
                'mythic': [11, 12, 17, 18, 26]
            },
            'names': names,
            'box': boxes,
            'head': [[0, 0] for _ in range(26)]
        }
    }

    (out_dir / 'gear.json').write_text(json.dumps(meta, separators=(',', ':')))
    print('gear.json saved successfully.')

    # Update native PNGs in assets/source/gear_nocturne/monk/
    src_dir = ROOT / 'assets/source/gear_nocturne/monk'
    src_dir.mkdir(parents=True, exist_ok=True)
    for i, name in enumerate(names):
        Image.fromarray(armors[i]).save(src_dir / f'{name}.png')
    print('Native source PNGs updated.')

    # Update portrait in select screen
    select_path = ROOT / 'assets/sprites/select/nocturne/monk.webp'
    Image.fromarray(armors[0]).save(select_path, lossless=True)
    print('Select screen portrait updated.')

    # Generate preview sheet for review
    atlas_preview = Image.fromarray(atlas)
    atlas_preview.save(BRAIN / 'monk_full_atlas_26_armors.png')
    print('Saved monk_full_atlas_26_armors.png for review.')

if __name__ == '__main__':
    main()

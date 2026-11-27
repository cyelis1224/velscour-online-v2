// Non-browser regression coverage for the continuous Act II / desert theme.
// Run: node tools/tests/sea_of_sand_music.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { locationMusicKind } from '../../src/game/musicrouting.mjs';

const audioSource = await readFile(new URL('../../src/core/audio.js', import.meta.url), 'utf8');
const gameSource = await readFile(new URL('../../src/game/game.js', import.meta.url), 'utf8');
const hearthSource = await readFile(new URL('../../src/game/hearth.js', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../../assets/audio/audio.json', import.meta.url), 'utf8'));
const track = await readFile(new URL('../../assets/audio/music/sea_of_sand.mp3', import.meta.url));

const worlds = [
  { kind: 'town', townId: 'act2_town', biome: { id: 'act2_town' } },
  { kind: 'overworld', biome: { id: 'sea_of_sand' } },
  { kind: 'dungeon', biome: { id: 'scorpion_king_pyramid' } },
];
assert.deepEqual(worlds.map(locationMusicKind), ['sea_of_sand', 'sea_of_sand', 'sea_of_sand'],
  'Act II town, Sea of Sand, and the Scorpion King pyramid share one music identity');
assert.equal(locationMusicKind({ kind: 'town', townId: 'herrington_hollow', biome: { id: 'town' } }), 'town',
  'Act I town music is unchanged');
assert.equal(locationMusicKind({ kind: 'town', townId: 'bellmourn', biome: { id: 'town' } }), 'town',
  'Act III town music is unchanged');
assert.equal(locationMusicKind({ kind: 'dungeon', biome: { id: 'fungal' } }), 'wilds',
  'unrelated dungeon music is unchanged');
assert.ok(track.length > 1_000_000 && track.subarray(0, 3).toString() === 'ID3', 'the supplied MP3 asset is present and readable');
assert.ok(manifest.music.sea_of_sand > 200 && manifest.music.sea_of_sand < 240, 'music manifest includes the track duration');
assert.match(audioSource, /sea_of_sand:\s*\{\s*songs:\s*\['sea_of_sand'\],\s*loop:\s*true/,
  'the desert director uses one looping song');
assert.match(audioSource, /if \(music && music\.kind === kind(?: && !opts\.force)?\) return;/,
  'entering another location with the shared music identity does not restart the current deck');
assert.match(audioSource, /deck\.load\(m\.song,[^\n]+!!def\.loop/,
  'loop configuration reaches the actual media deck');
assert.match(audioSource, /m\.song && !m\.def\.loop && !m\.deck\.playing && m\.deck\.el\.ended/,
  'looping music bypasses the song-end gap and restart path');
assert.match(gameSource, /playMusic\(locationMusicKind\(world\)\);\s*setAmbience\('sea_of_sand'\)/,
  'Act II town routes to the shared music identity while retaining its own ambience');
assert.match(gameSource, /playMusic\(locationMusicKind\((?:built\.)?world\)\); setAmbience\('tkeep'\)/,
  'the unrelated Act IV town retains town music and its dedicated ambience');
assert.match(gameSource, /const musicKind = locationMusicKind\(world\);\s*playMusic\(musicKind,/,
  'procedural environments route through the shared location music selector');
assert.match(hearthSource, /const musicKind = locationMusicKind\(dungeonWorld\);\s*playMusic\(musicKind,/,
  'returning through a Hearthstone portal preserves the shared location music selector');

console.log('sea_of_sand_music.mjs: all checks passed');

/*
 * Loads the game's browser scripts into a Node vm context (no DOM), the same way
 * index.html loads them, and returns the shared WOH object.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

module.exports = function load(files) {
  const ctx = { console, Math, Date, JSON, setTimeout, clearTimeout };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return ctx.WOH;
};

module.exports.DATA = ['js/data/clubs.js', 'js/data/footballers-core.js', 'js/data/footballers-clubs.js', 'js/cards.js'];

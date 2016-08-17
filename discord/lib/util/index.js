'use strict';

const emoji = require('./emoji.min');

// helpers
function escapeRegExp(s) {
  return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function unHtml(s) {
  return (s
    .replace(/<.*?>/g, '')
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
  );
}

function emojify(s) {
  emoji.colons_mode = false;
  emoji.replace_mode = 'unified'; // use unicode replacement
  emoji.inits.env = 1; // hack to ensure replace_mode isn't overwritten
  return emoji.replace_colons(s);
}

const unemojify = (() => {
  const shortcuts = {
    broken_heart: '</3',
    confused: ':-/',
    frowning: ':(',
    heart: '<3',
    hearts: '<3',
    neutral_face: ':|',
    open_mouth: ':o',
    smile: ':D',
    smiley: ':)',
    stuck_out_tongue: ':P',
    sunglasses: '8)',
    unamused: ':s',
    wink: ';)',
  };

  const regex = new RegExp(':(' + (Object.keys(shortcuts).join('|')) + '):', 'g');

  return function unemojify(s) {
    emoji.colons_mode = true;
    return emoji.replace_unified(s).replace(regex, (_, $1) => shortcuts[$1]);
  };
})();

// exports
module.exports = {
  escapeRegExp: escapeRegExp,
  unHtml: unHtml,
  emojify: emojify,
  unemojify: unemojify,
};

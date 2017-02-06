// set up maps
const mapColons = new Map();
const mapSurrogates = new Map();

// populate maps
{
  const emoji = require('./emoji.json');

  // add skin tones
  emoji.push(...['🏻', '🏼', '🏽', '🏾', '🏿'].map(
    (surrogates, index) => ({ surrogates, names: [`skin-tone-${index + 1}`] })
  ));

  for (const { names, surrogates } of emoji) {
    for (const name of names) {
      mapColons.set(name, surrogates);
    }

    mapSurrogates.set(surrogates, names[0]);
  }
}

// set up regexes
const regexColons = /:[a-zA-Z0-9-_+]+:/g;
const regexUnicode = (() => {
  const surr = Array.from(mapSurrogates.keys()).map(s => s.replace(/\*/g, '\\*'));
  return new RegExp(surr.join('|'), 'g');
})();

// exports
module.exports = {
  replaceColons(str) {
    return str.replace(regexColons, m => mapColons.get(m.slice(1, -1)) || m);
  },

  replaceUnicode(str) {
    return str.replace(regexUnicode, m => `:${mapSurrogates.get(m)}:`);
  },
};

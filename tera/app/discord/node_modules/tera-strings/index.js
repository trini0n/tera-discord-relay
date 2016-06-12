'use strict';

const STRINGS = require('./strings');

module.exports = function parse(str) {
  if (str[0] !== '@') {
    console.error('Unable to parse: "' + str + '"');
    return false;
  }

  const parts = str.slice(1).split('?');
  const first = parts.shift().split(':');
  const type = first[0].toLowerCase();
  const id = first[1];

  const params = {};
  for (let param of parts) {
    const p = param.split(':');
    params[p[0]] = p[1] || true;
  }

  const cat = STRINGS[type];
  if (!cat) {
    console.error('No strings known for type: "' + type + '"');
    return false;
  }

  let res = cat[id];
  if (!res) {
    console.error('No string known for "@' + type + ':' + id + '"');
    return false;
  }

  if (type === 'item') {
    let prefix = '';
    if (params.awakened) {
      prefix = 'Awakened: ';
    } else if (params.masterpiece) {
      prefix = 'Masterwork ';
    }
    res = prefix + res;
  }

  return res;
};

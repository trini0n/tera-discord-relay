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

function replaceAll(string, search, replace) {
  return string.replace(new RegExp(escapeRegExp(search), 'gi'), replace);
}

function getName(server, user) {
  const details = server.detailsOf(user);
  return (details && details.nick) || (user && user.username) || '(???)';
}

function toDiscord(message, server) {
  // convert @mention
  // 1 - nicknames
  for (let user of server.members) {
    const d = server.detailsOf(user);
    if (d.nick != null) {
      message = replaceAll(message, '@' + d.nick, user.mention());
    }
  }

  // 2 - usernames
  for (let user of server.members) {
    message = replaceAll(message, '@' + user.username, user.mention());
  }

  // convert #channel
  for (let ch of server.channels) {
    if (ch.type !== 'text') continue;
    message = replaceAll(message, '#' + ch.name, ch.mention());
  }

  // convert @role
  for (let role of server.roles) {
    message = replaceAll(message, '@' + role.name, role.mention());
  }

  // TODO convert :emoji:

  // return
  return message;
}

function fromDiscord(message, server) {
  return (message
    // @user, @!user
    .replace(/<@!?(\d+)>/g, (_, mention) => {
      const m = server.members.get('id', mention);
      return '@' + getName(server, m);
    })
    // #channel
    .replace(/<#(\d+)>/g, (_, mention) => {
      const m = server.channels.get('id', mention);
      return '#' + ((m && m.name) || '(???)');
    })
    // @role
    .replace(/<@&(\d+)>/g, (_, mention) => {
      const m = server.roles.get('id', mention);
      return '@' + ((m && m.name) || '(???)');
    })
    // :emoji:
    .replace(/<:(\w+):(\d+)>/g, (_, mention) => ':' + mention + ':')
  );
}

// exports
module.exports = {
  escapeRegExp: escapeRegExp,
  unHtml: unHtml,
  emojify: emojify,
  unemojify: unemojify,
  replaceAll: replaceAll,
  getName: getName,
  toDiscord: toDiscord,
  fromDiscord: fromDiscord,
};

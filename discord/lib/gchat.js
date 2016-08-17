'use strict';

const U = require('./util');

// helpers
function replaceAll(string, search, replace) {
  return string.replace(new RegExp(U.escapeRegExp(search), 'gi'), replace);
}

function getName(server, user) {
  const details = server.detailsOf(user);
  return (details && details.nick) || (user && user.username) || '(???)';
}

// main
module.exports = function gchatModule(app, config) {
  if (!config.channels.gchat) {
    // TODO
    return;
  }

  //const {bot, ipc} = app;
  const bot = app.bot;
  const ipc = app.ipc;

  ipc.on('chat', (author, message) => {
    //const {server, channel} = this;
    const server = this.server;
    const channel = this.channel;
    if (!server || !channel) return;

    // convert HTML to text
    message = U.unHtml(message);

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

    // send
    bot.sendMessage(channel, '[' + author + ']: ' + U.emojify(message));
  });

  ipc.on('guild', (motd, names) => {
    if (!this.channel) return;
    names.sort((a, b) => a.localeCompare(b));
    bot.setChannelTopic(this.channel,
      'Online: ' + names.join(', ') + ' // ' +
      'MotD: ' + U.emojify(U.unHtml(motd))
    );
  });

  ipc.on('sysmsg', (message) => {
    if (!this.channel) return;
    bot.sendMessage(this.channel, U.emojify(U.unHtml(message)));
  });

  bot.on('ready', () => {
    const server = bot.servers.get('id', config['server-id']);
    if (!server) {
      console.error('server "%s" not found', config['server-id']);
      console.error('servers:');
      for (let s of bot.servers) {
        console.error('- %s (%s)', s.name, s.id);
      }
      bot.logout();
      return;
    }

    const channel = server.channels.get('id', config.channels['gchat']);
    if (!channel || channel.type !== 'text') {
      console.error('text channel "%s" not found', config.channels['gchat']);
      console.error('channels:');
      for (let c of server.channels) {
        if (c.type !== 'text') continue;
        console.error('- #%s (%s)', c.name, c.id);
      }
      bot.logout();
      return;
    }

    this.server = server;
    this.channel = channel;
    console.log('routing gchat to #%s (%s)', channel.name, channel.id);

    ipc.send('fetch');
  });

  bot.on('message', (message) => {
    //const {server, channel} = this;
    const server = this.server;
    const channel = this.channel;
    if (!message.channel.equals(channel)) return;
    if (message.author.equals(bot.user)) return;

    const str = U.unemojify(message.content)
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
      .replace(/<:(\w+):(\d+)>/g, (_, mention) => ':' + mention + ':');

    const author = getName(server, message.author);
    ipc.send('chat', author, str);
  });
};

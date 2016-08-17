'use strict';

const U = require('./util');

// main
module.exports = function gchatModule(app, config) {
  if (!config.channels.gchat) {
    // TODO
    return;
  }

  //const {bot, ipc} = app;
  const bot = app.bot;
  const ipc = app.ipc;

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

    console.log('routing gchat to #%s (%s)', channel.name, channel.id);
    ipc.send('fetch');

    /*********
     * hooks *
     *********/
    ipc.on('chat', (author, message) => {
      // convert TERA HTML to Discord text
      message = U.emojify(U.toDiscord(U.unHtml(message), server));
      bot.sendMessage(channel, `[${author}]: ${message}`);
    });

    ipc.on('guild', (motd, names) => {
      names.sort((a, b) => a.localeCompare(b));
      bot.setChannelTopic(channel,
        'Online: ' + names.join(', ') + ' // ' +
        'MotD: ' + U.emojify(U.unHtml(motd))
      );
    });

    ipc.on('sysmsg', (message) => {
      // don't convert mentions; highlights from TERA login message are abusable
      bot.sendMessage(channel, U.emojify(U.unHtml(message)));
    });

    bot.on('message', (message) => {
      if (!message.channel.equals(channel)) return;
      if (message.author.equals(bot.user)) return;

      const author = U.getName(server, message.author);
      const str = U.unemojify(U.fromDiscord(message.content, server));
      ipc.send('chat', author, str);
    });
  });
};

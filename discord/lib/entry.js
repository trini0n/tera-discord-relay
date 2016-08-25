'use strict';

module.exports = function entryModule(app, config) {
  if (!config.channels['entry']) return;

  const bot = app.bot;

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

    const channel = server.channels.get('id', config.channels['entry']);
    if (!channel || channel.type !== 'text') {
      console.error('text channel "%s" not found', config.channels['entry']);
      console.error('channels:');
      for (let c of server.channels) {
        if (c.type !== 'text') continue;
        console.error('- #%s (%s)', c.name, c.id);
      }
      bot.logout();
      return;
    }

    console.log('routing entry to #%s (%s)', channel.name, channel.id);

    bot.on('serverNewMember', (server, user) => {
      bot.sendMessage(channel, `@everyone please give ${user} a warm welcome!`);
    });
  });
};

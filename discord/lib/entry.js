const U = require('./util');

module.exports = function entryModule(app, config) {
  if (!config.channels['entry']) return;

  const {bot} = app;

  bot.on('ready', () => {
    const server = U.getServer(bot, config['server-id']);
    if (!server) {
      console.warn('* entry module is disabled');
      return;
    }

    const channel = U.getTextChannel(server, config.channels['entry']);
    if (!channel) {
      console.warn('* gchat module is disabled');
      return;
    }

    console.log('routing entry to #%s (%s)', channel.name, channel.id);

    bot.on('serverNewMember', (server, user) => {
      channel.sendMessage(`@everyone please give ${user} a warm welcome!`);
    });
  });
};

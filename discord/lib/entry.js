const U = require('./util');

module.exports = function entryModule(app, config) {
  if (!config.channels['entry']) return;

  const {bot} = app;

  bot.once('ready', () => {
    const server = U.getServer(bot, config['server-id']);
    if (!server) {
      console.warn('* entry module is disabled');
      return;
    }

    const channel = U.getTextChannel(server, config.channels['entry']);
    if (!channel) {
      console.warn('* entry module is disabled');
      return;
    }

    console.log('routing entry to #%s (%s)', channel.name, channel.id);

    bot.on('guildMemberAdd', (user) => {
      if (user.guild.id === server.id) {
        channel.sendMessage(`@everyone please give ${user} a warm welcome!`);
      }
    });
  });
};

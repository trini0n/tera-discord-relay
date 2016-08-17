'use strict';

module.exports = function entryModule(app, config) {
  if (!config || !config.channels) return;

  app.bot.on('serverNewMember', (server, user) => {
    const channel = config.channels['entry'];
    if (channel) {
      bot.sendMessage(channel, `@everyone please give $(user) a warm welcome!`);
    }
  });
};

const U = require('./util');

// main
module.exports = function gchatModule(app, config) {
  if (!config.channels.gchat) return;

  const {bot, ipc} = app;

  bot.once('ready', () => {
    const server = U.getServer(bot, config['server-id']);
    if (!server) {
      console.warn('* gchat module is disabled');
      return;
    }

    const channel = U.getTextChannel(server, config.channels['gchat']);
    if (!channel) {
      console.warn('* gchat module is disabled');
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
      channel.sendMessage(`[${author}]: ${message}`);
    });

    const guild = {
      motd: '',
      members: [],
      quest: [],
    };

    const updateTopic = (() => {
      let timer = null;
      let lastTopic = '';

      return function updateTopic() {
        if (!timer) {
          timer = setTimeout(() => {
            const parts = [];

            // member list
            const online = (guild.members.length > 0) ? guild.members.join(', ') : '(Nobody)';
            parts.push('Online: ' + online);

            // guild quest
            if (guild.quest.length > 0) {
              const quests = guild.quest.map((quest) => {
                let progress;

                if (quest.targets) {
                  const targets = quest.targets.map(target =>
                    `${target.name}: ${target.completed}/${target.total}`
                  );
                  progress = targets.join(', ');
                } else {
                  progress = `${quest.completed}/${quest.total}`;
                }

                return `${quest.name} [${progress}]`;
              });

              parts.push('Quests: ' + quests.join(', '));
            }

            // motd
            if (guild.motd.length > 0) {
              parts.push('MotD: ' + U.emojify(U.unHtml(guild.motd)));
            }

            // update
            const topic = parts.join(' // ');
            if (topic !== lastTopic) {
              channel.setTopic(topic);
              lastTopic = topic;
            }

            timer = null;
          }, 500);
        }
      };
    })();

    ipc.on('motd', (motd) => {
      guild.motd = motd;
      updateTopic();
    });

    ipc.on('members', (members) => {
      members.sort((a, b) => a.localeCompare(b));
      guild.members = members;
      updateTopic();
    });

    ipc.on('quest', (quest) => {
      guild.quest = quest;
      updateTopic();
    });

    ipc.on('sysmsg', (message) => {
      // don't convert mentions; highlights from TERA login message are abusable
      channel.sendMessage(U.emojify(U.unHtml(message)), { disable_everyone: true });
    });

    bot.on('message', (message) => {
      if (message.channel.id !== channel.id) return;
      if (message.author.id === bot.user.id) return;

      const author = U.getName(server, message.author);
      const str = U.unemojify(U.fromDiscord(message.content, server));
      ipc.send('chat', author, str);
    });
  });
};

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

    const guild = {
      motd: '',
      members: [],
      quest: false,
    };

    const updateTopic = (() => {
      let timer = null;
      let lastTopic = '';

      return function updateTopic() {
        if (!timer) {
          timer = setTimeout(() => {
            const parts = [];

            // member list
            const online = (guild.members.length > 0) ? guild.members.join(', ') : '*Nobody*';
            parts.push('Online: ' + online);

            // guild quest
            if (guild.quest) {
              let progress;

              if (guild.quest.targets) {
                const targets = guild.quest.targets.map(target =>
                  `${target.name}: ${target.completed}/${target.total}`
                );
                progress = targets.join(', ');
              } else {
                progress = `${target.completed}/${target.total}`;
              }

              parts.push(`Quest: **${guild.quest.name}** [${progress}]`);
            }

            // motd
            if (guild.motd.length > 0) {
              parts.push('MotD: ' + U.emojify(U.unHtml(guild.motd)));
            }

            // update
            const topic = parts.join(' // ');
            if (topic !== lastTopic) {
              bot.setChannelTopic(channel, topic);
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

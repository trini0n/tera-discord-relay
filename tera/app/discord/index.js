const Sysmsg = require('sysmsg');
const TeraStrings = require('tera-strings');
const IPC = require('./ipc');

// constants
const REFRESH_THRESHOLD = 60 * 1000;
const REFRESH_TIMER = 15 * 1000;

// helpers
function conv(s) {
  return TeraStrings(s) || '(???)';
}

function escapeRegExp(s) {
  return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function escapeHtml(str) {
  const entities = {
    '"': 'quot',
    '&': 'amp',
    '<': 'lt',
    '>': 'gt',
  };

  return str.replace(/["&<>]/g, e => `&${entities[e]};`);
}

function escape(str) {
  const words = [
    '.com',
    'fag',
    'mmoc',
    'molest',
    'nigg',
  ];

  const wordRegex = new RegExp('(' + words.map(escapeRegExp).join('|') + ')', 'gi');

  return (escapeHtml(str)
    .replace(wordRegex, match => match[0] + '&#8206;' + match.slice(1))
    .replace(/w-w/gi, match => match.split('-').join('-&#8206;'))
    .replace(/w{3,}/gi, match => match.split('').join('&#8206;'))
    .replace(/w w w/gi, match => match.split(' ').join('&#8206; '))
    .replace(/\n/g, ' ').replace(/\t/g, '    ')
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '?')
    .replace(/[^\x20-\x7E]/g, '?')
  );
}

// main
module.exports = function Discord(dispatch, config) {
  let path = config.socketName;
  if (process.platform === 'win32') {
    path = '\\\\.\\pipe\\' + path;
  } else {
    path = '/tmp/' + path + '.sock';
  }

  let loaded = false;
  let messageQueue = [];
  function sendOrQueue(...args) {
    if (!loaded) {
      messageQueue.push(args);
    } else {
      dispatch.toServer(...args);
    }
  }

  const sysmsg = new Sysmsg(dispatch);
  const ipc = new IPC.client(path, (event, ...args) => {
    switch (event) {
      case 'fetch': {
        for (let typename in GINFO_TYPE) {
          requestGuildInfo(GINFO_TYPE[typename]);
        }
        break;
      }

      case 'chat': {
        const [author, message] = args;
        sendOrQueue('cChat', 1, {
          channel: 2,
          message: '<FONT>' + escape(`<${author}> ${message}`) + '</FONT>',
        });
        break;
      }

      case 'whisper': {
        const [target, message] = args;
        sendOrQueue('cWhisper', 1, {
          target: target,
          message: `<FONT>${message}</FONT>`,
        });
        break;
      }

      case 'info': {
        const [message] = args;
        sendOrQueue('cChat', 1, {
          channel: 2,
          message: `<FONT>* ${escape(message)}</FONT>`,
        });
        break;
      }
    }
  });

  let guildId = 0;
  let myName = false;
  let motd = '';
  let allGuildies = [];
  let guildMembers = [];

  const GINFO_TYPE = {
    details: 2,
    members: 5,
    quests: 6,
  };

  const requestGuildInfo = (() => {
    const timers = {};

    function doRequest(type) {
      dispatch.toServer('cRequestGuildInfo', 1, { guildId, type });
      timers[type] = null;
    }

    return function requestGuildInfo(type, immediate) {
      if (!immediate) {
        if (!timers[type]) {
          timers[type] = setTimeout(doRequest, 100, type);
        }
      } else {
        if (timers[type]) clearTimeout(timers[type]);
        doRequest(type); // will unset timers[type]
      }
    };
  })();

  // auto updates
  const lastUpdate = {};

  setInterval(() => {
    if (!guildId) return;
    for (let typename in GINFO_TYPE) {
      const type = GINFO_TYPE[typename];
      if (lastUpdate[type] && Date.now() - lastUpdate[type] > REFRESH_THRESHOLD) {
        lastUpdate[type] = Date.now();
        requestGuildInfo(type);
      }
    }
  }, REFRESH_TIMER);

  dispatch.hook('sLogin', 2, (event) => {
    myName = event.name;
  });

  dispatch.hook('sChat', 1, (event) => {
    if (event.channel === 2 && event.authorName !== myName) {
      ipc.send('chat', event.authorName, event.message);
    }
  });

  dispatch.hook('sWhisper', 1, (event) => {
    if (event.recipient === myName) {
      ipc.send('whisper', event.author, event.message);
    }
  });

  dispatch.hook('sLoadTopo', 1, (event) => {
    loaded = true;
    while (messageQueue.length > 0) {
      dispatch.toServer(...messageQueue.shift());
    }
  });

  /*****************
   * Guild Notices *
   *****************/
  sysmsg.on('SMT_GC_MSGBOX_APPLYLIST_1', (params) => {
    ipc.send('sysmsg', `${params['Name']} joined the guild.`);
    requestGuildInfo(GINFO_TYPE.members);
  });

  sysmsg.on('SMT_GC_MSGBOX_APPLYRESULT_1', (params) => {
    ipc.send('sysmsg', `${params['Name1']} accepted ${params['Name2']} into the guild.`);
    requestGuildInfo(GINFO_TYPE.members);
  });

  sysmsg.on('SMT_GUILD_LOG_LEAVE', (params) => {
    ipc.send('sysmsg', `${params['UserName']} has left the guild.`);
    requestGuildInfo(GINFO_TYPE.members);
  });

  sysmsg.on('SMT_GUILD_LOG_BAN', (params) => {
    ipc.send('sysmsg', `${params['UserName']} was kicked out of the guild.`);
    requestGuildInfo(GINFO_TYPE.members);
  });

  sysmsg.on('SMT_GUILD_MEMBER_LOGON', (params) => {
    ipc.send('sysmsg', `${params['UserName']} logged in. Message: ${params['Comment']}`);
    requestGuildInfo(GINFO_TYPE.members);
  });

  sysmsg.on('SMT_GUILD_MEMBER_LOGON_NO_MESSAGE', (params) => {
    ipc.send('sysmsg', `${params['UserName']} logged in.`);
    requestGuildInfo(GINFO_TYPE.members);
  });

  sysmsg.on('SMT_GUILD_MEMBER_LOGOUT', (params) => {
    ipc.send('sysmsg', `${params['UserName']} logged out.`);
    requestGuildInfo(GINFO_TYPE.members);
  });

  sysmsg.on('SMT_GC_SYSMSG_GUILD_CHIEF_CHANGED', (params) => {
    ipc.send('sysmsg', `${params['Name']} is now the Guild Master.`);
  });

  sysmsg.on('SMT_ACCOMPLISH_ACHIEVEMENT_GRADE_GUILD', (params) => {
    ipc.send('sysmsg', `${params['name']} earned a ${conv(params['grade'])}.`);
  });

  /****************
   * Guild Quests *
   ****************/
  dispatch.hook('sGuildQuestList', 1, (event) => {
    lastUpdate[GINFO_TYPE.quests] = Date.now();

    const quests = event.quests.filter(quest => quest.status !== 0);

    ipc.send('quest', quests.map((quest) => {
      const name = conv(quest.name);

      if (quest.targets.length === 1 && name != 'Crafting Supplies') {
        const [target] = quest.targets;
        return { name, completed: target.completed, total: target.total };
      } else {
        const targets = quest.targets.map(target => ({
          name: conv(`@item:${target.info2}`),
          completed: target.completed,
          total: target.total,
        }));
        return { name, targets };
      }
    }));
  });

  dispatch.hook('sUpdateGuildQuestStatus', 1, (event) => {
    requestGuildInfo(GINFO_TYPE.quests);
  });

  sysmsg.on('SMT_GQUEST_NORMAL_ACCEPT', (params) => {
    ipc.send('sysmsg', `Received **${conv(params['guildQuestName'])}**.`);
  });

  sysmsg.on('SMT_GQUEST_NORMAL_COMPLETE', (params) => {
    ipc.send('sysmsg', `Completed **${conv(params['guildQuestName'])}**.`);
  });

  sysmsg.on('SMT_GQUEST_NORMAL_CANCEL', (params) => {
    ipc.send('sysmsg', `${params['userName']} canceled **${conv(params['guildQuestName'])}**.`);
    requestGuildInfo(GINFO_TYPE.quests);
  });

  sysmsg.on('SMT_GQUEST_NORMAL_FAIL_OVERTIME', (params) => {
    ipc.send('sysmsg', `Failed **${conv(params['guildQuestName'])}**.`); // ?
    requestGuildInfo(GINFO_TYPE.quests);
  });

  sysmsg.on('SMT_GQUEST_NORMAL_END_NOTICE', (params) => {
    ipc.send('sysmsg', `The current guild quest ends in 10min.`); // ?
  });

  sysmsg.on('SMT_GQUEST_NORMAL_CARRYOUT', (params) => {
    if (params['targetValue'] > 25) return; // silence gather quests
    ipc.send('sysmsg',
      `${params['userName']} advanced **${conv(params['guildQuestName'])}**. ` +
      `(${params['value']}/${params['targetValue']})`
    );
  });

  sysmsg.on('SMT_CHANGE_GUILDLEVEL', (params) => {
    ipc.send('sysmsg', `Guild level is now **${params['GuildLevel']}**.`);
  });

  sysmsg.on('SMT_LEARN_GUILD_SKILL_SUCCESS', (params) => {
    ipc.send('sysmsg', `The guild has learned a new skill.`);
  });

  sysmsg.on('SMT_GUILD_INCENTIVE_SUCCESS', (params) => {
    ipc.send('sysmsg', `Guild funds have been delivered via parcel post.`);
  });

  /****************
   * Misc Notices *
   ****************/
  sysmsg.on('SMT_MAX_ENCHANT_SUCCEED', (params) => {
    if (allGuildies.indexOf(params['UserName']) !== -1) {
      ipc.send('sysmsg', escapeHtml(
        `${params['UserName']} has successfully enchanted ` +
        `(+${params['Added']}) <${conv(params['ItemName'])}>.`
      ));
    }
  });

  sysmsg.on('SMT_GACHA_REWARD', (params) => {
    if (allGuildies.indexOf(params['UserName']) !== -1) {
      ipc.send('sysmsg', escapeHtml(
        `${params['UserName']} obtained <${conv(params['randomItemName'])}> x ` +
        `${params['randomItemCount']} from <${conv(params['gachaItemName'])}>.`
      ));
    }
  });

  /***************
   * guild hooks *
   ***************/
  dispatch.hook('sGuildInfo', 1, (event) => {
    lastUpdate[GINFO_TYPE.details] = Date.now();

    guildId = event.id;
    motd = event.motd;

    ipc.send('motd', motd);
  });

  dispatch.hook('sGuildMemberList', 1, (event) => {
    lastUpdate[GINFO_TYPE.members] = Date.now();

    if (event.first) {
      allGuildies = [];
      guildMembers = [];
    }

    for (let member of event.members) {
      allGuildies.push(member.name);
      if (member.status !== 2 && member.name !== myName) {
        guildMembers.push(member.name);
      }
    }

    if (event.last) {
      ipc.send('members', guildMembers);
    }
  });
};

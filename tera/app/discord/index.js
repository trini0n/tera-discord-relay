'use strict';

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

  const sysmsg = new Sysmsg(dispatch);
  const ipc = new IPC.client(path, function() { // (event, ...args) in node v6
    const args = [...arguments];
    const event = args.shift();

    let author, message, target;

    switch (event) {
      case 'fetch':
        for (let typename in GINFO_TYPE) {
          requestGuildInfo(GINFO_TYPE[typename]);
        }
        break;

      case 'chat':
        author = args[0];
        message = args[1];
        dispatch.toServer('cChat', {
          channel: 2,
          message: '<FONT>' + escape(`<${author}> ${message}`) + '</FONT>',
        });
        break;

      case 'whisper':
        target = args[0];
        message = args[1];
        dispatch.toServer('cWhisper', {
          target: target,
          message: '<FONT>' + message + '</FONT>',
        });
        break;

      case 'info':
        message = args[0];
        return dispatch.toServer('cChat', {
          channel: 2,
          message: `<FONT>* ${escape(message)}</FONT>`,
        });
        break;
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
      dispatch.toServer('cRequestGuildInfo', { guildId, type });
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
    for (let typename in GINFO_TYPE) {
      const type = GINFO_TYPE[typename];
      if (lastUpdate[type] && Date.now() - lastUpdate[type] > REFRESH_THRESHOLD) {
        lastUpdate[type] = Date.now();
        requestGuildInfo(type);
      }
    }
  }, REFRESH_TIMER);

  dispatch.hook('sLogin', event => {
    myName = event.name;
  });

  dispatch.hook('sChat', event => {
    if (event.channel === 2 && event.authorName !== myName) {
      ipc.send('chat', event.authorName, event.message);
    }
  });

  dispatch.hook('sWhisper', event => {
    if (event.recipient === myName) {
      ipc.send('whisper', event.author, event.message);
    }
  });

  /*****************
   * Guild Notices *
   *****************/
  sysmsg.on('smtGcMsgboxApplylist1', function(params) {
    ipc.send('sysmsg', `${params['Name']} joined the guild.`);
    requestGuildInfo(GINFO_TYPE.members);
  });

  sysmsg.on('smtGcMsgboxApplyresult1', function(params) {
    ipc.send('sysmsg', `${params['Name1']} accepted ${params['Name2']} into the guild.`);
    requestGuildInfo(GINFO_TYPE.members);
  });

  sysmsg.on('smtGuildLogLeave', function(params) {
    ipc.send('sysmsg', `${params['UserName']} has left the guild.`);
    requestGuildInfo(GINFO_TYPE.members);
  });

  sysmsg.on('smtGuildLogBan', function(params) {
    ipc.send('sysmsg', `${params['UserName']} was kicked out of the guild.`);
    requestGuildInfo(GINFO_TYPE.members);
  });

  sysmsg.on('smtGuildMemberLogon', function(params) {
    ipc.send('sysmsg', `${params['UserName']} logged in. Message: ${params['Comment']}`);
    requestGuildInfo(GINFO_TYPE.members);
  });

  sysmsg.on('smtGuildMemberLogonNoMessage', function(params) {
    ipc.send('sysmsg', `${params['UserName']} logged in.`);
    requestGuildInfo(GINFO_TYPE.members);
  });

  sysmsg.on('smtGuildMemberLogout', function(params) {
    ipc.send('sysmsg', `${params['UserName']} logged out.`);
    requestGuildInfo(GINFO_TYPE.members);
  });

  sysmsg.on('smtGcSysmsgGuildChiefChanged', function(params) {
    ipc.send('sysmsg', `${params['Name']} is now the Guild Master.`);
  });

  sysmsg.on('smtAccomplishAchievementGradeGuild', function(params) {
    ipc.send('sysmsg', `${params['name']} earned a ${conv(params['grade'])}.`);
  });

  /****************
   * Guild Quests *
   ****************/
  dispatch.hook('sGuildQuestList', event => {
    lastUpdate[GINFO_TYPE.quests] = Date.now();

    const quest = event.quests[0];
    if (!quest.accepted) {
      ipc.send('quest', false);
      return;
    }

    const name = conv(quest.name);

    if (quest.targets.length === 1 && name != 'Crafting Supplies') {
      const target = quest.targets[0];
      ipc.send('quest', { name, completed: target.completed, total: target.total });
    } else {
      const targets = quest.targets.map(target => ({
        name: conv(`@item:${target.info2}`),
        completed: target.completed,
        total: target.total,
      }));
      ipc.send('quest', { name, targets });
    }
  });

  dispatch.hook('sUpdateGuildQuestSystemMsg', event => {
    const quest = conv(`@GuildQuest:${event.quest}001`);

    switch (sysmsg.sysmsgs.map.code[event.sysmsg]) {
      case 'smtGquestNormalAccept':
        ipc.send('sysmsg', `${event.user} accepted **${quest}**.`);
        break;

      case 'smtGquestNormalComplete':
        ipc.send('sysmsg', `Completed **${quest}**.`);
        break;

      // smtGquestOccupyAccept
      // smtGquestOccupyComplete
    }

    requestGuildInfo(GINFO_TYPE.quests);
  });

  dispatch.hook('sUpdateGuildQuestStatus', event => {
    requestGuildInfo(GINFO_TYPE.quests);
  });

  sysmsg.on('smtGquestNormalCancel', function(params) {
    ipc.send('sysmsg', `${params['userName']} canceled **${conv(params['guildQuestName'])}**.`);
    requestGuildInfo(GINFO_TYPE.quests);
  });

  sysmsg.on('smtGquestNormalFailOvertime', function(params) {
    ipc.send('sysmsg', `Failed **${conv(params['guildQuestName'])}**.`); // ?
    requestGuildInfo(GINFO_TYPE.quests);
  });

  sysmsg.on('smtGquestNormalEndNotice', function(params) {
    ipc.send('sysmsg', `The current guild quest ends in 10min.`); // ?
  });

  sysmsg.on('smtGquestNormalCarryout', function(params) {
    if (params['targetValue'] > 25) return; // silence gather quests
    ipc.send('sysmsg',
      `${params['userName']} advanced **${conv(params['guildQuestName'])}**. ` +
      `(${params['value']}/${params['targetValue']})`
    );
  });

  sysmsg.on('smtChangeGuildlevel', function(params) {
    ipc.send('sysmsg', `Guild level is now **${params['GuildLevel']}**.`);
  });

  sysmsg.on('smtLearnGuildSkillSuccess', function(params) {
    ipc.send('sysmsg', `The guild has learned a new skill.`);
  });

  sysmsg.on('smtGuildIncentiveSuccess', function(params) {
    ipc.send('sysmsg', `Guild funds have been delivered via parcel post.`);
  });

  /****************
   * Misc Notices *
   ****************/
  sysmsg.on('smtMaxEnchantSucceed', function(params) {
    if (allGuildies.indexOf(params['UserName']) !== -1) {
      ipc.send('sysmsg', escapeHtml(
        `${params['UserName']} has successfully enchanted ` +
        `(+${params['Added']}) <${conv(params['ItemName'])}>.`
      ));
    }
  });

  sysmsg.on('smtGachaReward', function(params) {
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
  dispatch.hook('sGuildInfo', event => {
    lastUpdate[GINFO_TYPE.details] = Date.now();

    guildId = event.id;
    motd = event.motd;

    ipc.send('motd', motd);
  });

  dispatch.hook('sGuildMemberList', event => {
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

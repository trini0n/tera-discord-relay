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
        dispatch.toServer('cRequestGuildMemberList');
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

  let myName = false;
  let motd = '';
  let allGuildies = [];
  let guildMembers = [];
  let lastUpdate = null;

  setInterval(() => {
    if (lastUpdate && Date.now() - lastUpdate > REFRESH_THRESHOLD) {
      dispatch.toServer('cRequestGuildMemberList');
      lastUpdate = Date.now();
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
    dispatch.toServer('cRequestGuildMemberList');
  });

  sysmsg.on('smtGcMsgboxApplyresult1', function(params) {
    ipc.send('sysmsg', `${params['Name1']} accepted ${params['Name2']} into the guild.`);
    dispatch.toServer('cRequestGuildMemberList');
  });

  sysmsg.on('smtGuildLogLeave', function(params) {
    ipc.send('sysmsg', `${params['UserName']} has left the guild.`);
    dispatch.toServer('cRequestGuildMemberList');
  });

  sysmsg.on('smtGuildLogBan', function(params) {
    ipc.send('sysmsg', `${params['UserName']} was kicked out of the guild.`);
    dispatch.toServer('cRequestGuildMemberList');
  });

  sysmsg.on('smtGuildMemberLogon', function(params) {
    ipc.send('sysmsg', `${params['UserName']} logged in. Message: ${params['Comment']}`);
    dispatch.toServer('cRequestGuildMemberList');
  });

  sysmsg.on('smtGuildMemberLogonNoMessage', function(params) {
    ipc.send('sysmsg', `${params['UserName']} logged in.`);
    dispatch.toServer('cRequestGuildMemberList');
  });

  sysmsg.on('smtGuildMemberLogout', function(params) {
    ipc.send('sysmsg', `${params['UserName']} logged out.`);
    dispatch.toServer('cRequestGuildMemberList');
  });

  sysmsg.on('smtGcSysmsgGuildChiefChanged', function(params) {
    ipc.send('sysmsg', `${params['Name']} is now the Guild Master.`);
  });

  sysmsg.on('smtAccomplishAchievementGradeGuild', function(params) {
    ipc.send('sysmsg', `${params['name']} earned a ${conv(params['grade'])}.`);
  });

  sysmsg.on('smtGquestNormalAccept', function(params) {
    ipc.send('sysmsg', `Received ${params['guildQuestName']}.`);
  });

  sysmsg.on('smtGquestNormalCancel', function(params) {
    ipc.send('sysmsg', `${params['userName']} canceled ${params['guildQuestName']}.`);
  });

  sysmsg.on('smtGquestNormalComplete', function(params) {
    ipc.send('sysmsg', `Completed ${params['guildQuestName']}.`);
  });

  sysmsg.on('smtGquestNormalFailOvertime', function(params) {
    ipc.send('sysmsg', `Failed ${params['guildQuestName']}.`);
  });

  sysmsg.on('smtGquestNormalEndNotice', function(params) {
    ipc.send('sysmsg', `The current guild quest ends in 10min.`);
  });

  sysmsg.on('smtLearnGuildSkillSuccess', function(params) {
    ipc.send('sysmsg', `Your guild has learned a new skill.`);
  });

  sysmsg.on('smtGuildIncentiveSuccess', function(params) {
    ipc.send('sysmsg', `Guild funds are delivered via parcel post.`);
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
    motd = event.motd;
    lastUpdate = Date.now();
  });

  dispatch.hook('sGuildMemberList', event => {
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
      ipc.send('guild', motd, guildMembers);
    }
  });
};

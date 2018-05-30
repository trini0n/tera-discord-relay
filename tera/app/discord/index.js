const Sysmsg = require('sysmsg');
const TeraStrings = require('tera-strings');
const IPC = require('./ipc');
const request = require('request');

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

try {
  	require('guild-app-inspector')(dispatch)
    console.log('guild-app-inspector successfully loaded')
  } catch (e) {
  	console.warn()
  	console.warn(`[proxy] failed to load guild-app-inspector`)
  	console.warn(e.stack)
  	console.warn()
  }

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
        sendOrQueue('C_CHAT', 1, {
          channel: 2,
          message: '<FONT>' + escape(`<${author}> ${message}`) + '</FONT>',
        });
        break;
      }

      case 'whisper': {
        const [target, message] = args;
        sendOrQueue('C_WHISPER', 1, {
          target: target,
          message: `<FONT>${message}</FONT>`,
        });
        break;
      }

      case 'info': {
        const [message] = args;
        sendOrQueue('C_CHAT', 1, {
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
  let inspectSet = new Set();

  const GINFO_TYPE = {
    details: 2,
    members: 5,
    quests: 6,
  };

  const requestGuildInfo = (() => {
    const timers = {};

    function doRequest(type) {
      dispatch.toServer('C_REQUEST_GUILD_INFO', 1, { guildId, type });
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

  dispatch.hook('S_LOGIN', 10, (event) => {
    myName = event.name;
  });

  dispatch.hook('S_CHAT', 1, (event) => {
    if (event.channel === 2 && event.authorName !== myName) {
      ipc.send('chat', event.authorName, event.message);
    }
  });

  dispatch.hook('S_WHISPER', 1, (event) => {
    if (event.recipient === myName) {
      ipc.send('rwhisper', event.author, event.message);
      inspectSet.add(event.author);
      dispatch.toServer('C_REQUEST_USER_PAPERDOLL_INFO', 1, {
        name: event.author,
      });
    }
  });

    let player;
  	let cid;
  	let model;
    let messageMap = new Map();
    let myPlayerId;
    let currentApplicants = new Set();

    dispatch.hook('S_LOGIN', 10, (event) => {
      ({cid, model} = event);
      myName = event.name;
  	  player = event.name;
      myPlayerId = event.playerId;
    });

    dispatch.hook('S_ANSWER_INTERACTIVE', 2, event => {
      var className = modelToClass(event.model);

      if(currentApplicants.has(event.name)) {
        ipc.send('guildapp', `@here ` + event.name + ` (Level ` + event.level + ` ` + className + `) applied to the guild. Their message: ` + messageMap.get(event.name));
      }
    });

    dispatch.hook('S_GUILD_APPLY_LIST', 1, (event) => {
      let newCurrentApplicants = new Set();
      for(var i = 0; event.apps[i] !== undefined && i < event.apps.length; i++) {
        var currentApp = event.apps[i];
        newCurrentApplicants.add(currentApp.name);
        messageMap.set(currentApp.name, currentApp.message);
        if(!(currentApplicants.has(currentApp.name))) {
          inspectSet.add(currentApp.name);
        }
      }
      currentApplicants = newCurrentApplicants;
    });

    dispatch.hook('S_USER_PAPERDOLL_INFO', 2, (event) => {
      if(inspectSet.delete(event.name) && currentApplicants.has(event.name))
        ipc.send('guildapp', `Inspected ` + event.name + ` -- click here to view: http://mt-directory.herokuapp.com/` + event.name);
    });

    setInterval(function(){
      for(let name of inspectSet){
        dispatch.toServer('C_REQUEST_USER_PAPERDOLL_INFO', 1, {
          name: name,
        });
        console.log("attempting to inspect " + name);
      }
    }, 25000 + Math.floor(Math.random() * 10000));

  function modelToClass(model){
    var className;
    switch(model % 100) {
      case 1: className = 'Warrior'; break;
      case 2: className = 'Lancer'; break;
      case 3: className = 'Slayer'; break;
      case 4: className = 'Berserker'; break;
      case 5: className = 'Sorcerer'; break;
      case 6: className = 'Archer'; break;
      case 7: className = 'Priest'; break;
      case 8: className = 'Mystic'; break;
      case 9: className = 'Reaper'; break;
      case 10: className = 'Gunner'; break;
      case 11: className = 'Brawler'; break;
      case 12: className = 'Ninja'; break;
      case 13: className = 'Valkyrie'; break;
      default: className = 'UNKNOWN_CLASS';
    }
    return className;
  }

  dispatch.hook('S_LOAD_TOPO', 1, (event) => {
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
    dispatch.toServer('C_REQUEST_USER_PAPERDOLL_INFO', 1, {
		name: params['UserName'],
    });
  });

  sysmsg.on('SMT_GUILD_MEMBER_LOGON_NO_MESSAGE', (params) => {
    ipc.send('sysmsg', `${params['UserName']} logged in.`);
    requestGuildInfo(GINFO_TYPE.members);
    dispatch.toServer('C_REQUEST_USER_PAPERDOLL_INFO', 1, {
		name: params['UserName'],
    });
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
  dispatch.hook('S_GUILD_QUEST_LIST', 1, (event) => {
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

  dispatch.hook('S_UPDATE_GUILD_QUEST_STATUS', 1, (event) => {
    requestGuildInfo(GINFO_TYPE.quests);
  });

  sysmsg.on('SMT_GQUEST_NORMAL_ACCEPT', (params) => {
	console.log(JSON.stringify(params));
    ipc.send('sysmsg', `Accepted **${conv(params['guildQuestName'])}**.`);
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
  
  sysmsg.on('SMT_GQUEST_URGENT_NOTIFY', (params) => {
	var d = new Date();
	var today = d.getDay();
	if(today != 2 && today != 5)
		ipc.send('rally', `@rally BAM spawning soon!`);
	else
		ipc.send('rally', `@rally (PVP) BAM spawning soon!`);
  });

  /****************
   * Misc Notices *
   ****************/
    sysmsg.on('SMT_MAX_ENCHANT_SUCCEED', (params) => {
    var parts = params['ItemName'].slice(1).split('?');
    var last = parts.pop().split(':');
    var enchant = last[1];
    if (allGuildies.indexOf(params['UserName']) !== -1) {
      ipc.send('sysmsg', escapeHtml(
        `${params['UserName']} has successfully enchanted ` +
        `(+` + enchant + `) <${conv(params['ItemName'])}>.`
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
  dispatch.hook('S_GUILD_INFO', 1, (event) => {
    lastUpdate[GINFO_TYPE.details] = Date.now();

    guildId = event.id;
    motd = event.motd;

    ipc.send('motd', motd);
  });

  dispatch.hook('S_GUILD_MEMBER_LIST', 1, (event) => {
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

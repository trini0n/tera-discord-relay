const fs = require('fs');

const Discord = require('discord.js');
const IPC = require('./ipc');
const emoji = require('./lib/emoji.min');

// config
const fn = process.argv[2];
if (fn == null) {
  console.error('please specify config file');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(fn, 'utf8'));

// vars
const bot = new Discord.Client({ autoReconnect: true });
let server = null;
let channel = null;

// helpers
const escapeRegExp = s => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

const unHtml = s => (
  s
    .replace(/<.*?>/g, '')
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
);

function emojify(s) {
  emoji.colons_mode = false;
  emoji.replace_mode = 'unified'; // use unicode replacement
  emoji.inits.env = 1; // hack to ensure replace_mode isn't overwritten
  return emoji.replace_colons(s);
}

const unemojify = (() => {
  const shortcuts = {
    broken_heart: '</3',
    confused: ':-/',
    frowning: ':(',
    heart: '<3',
    hearts: '<3',
    neutral_face: ':|',
    open_mouth: ':o',
    smile: ':D',
    smiley: ':)',
    stuck_out_tongue: ':P',
    sunglasses: '8)',
    unamused: ':s',
    wink: ';)',
  };

  const regex = new RegExp(':(' + (Object.keys(shortcuts).join('|')) + '):', 'g');

  return function unemojify(s) {
    emoji.colons_mode = true;
    return emoji.replace_unified(s).replace(regex, (_, $1) => shortcuts[$1]);
  };
})();

// ipc
let path = config['socket-name'];
if (process.platform === 'win32') {
  path = '\\\\.\\pipe\\' + path;
} else {
  path = "/tmp/" + path + ".sock";
}

const ipc = new IPC.server(path, (event, ...args) => {
  if (!channel) return;

  switch (event) {
    case 'chat':
      let [author, message] = args;

      // convert HTML to text
      message = unHtml(message);

      // convert @mention
      // 1 - nicknames
      for (let user of server.members) {
        const d = server.detailsOf(user);
        if (d.nick != null) {
          const regexp = new RegExp('@' + escapeRegExp(d.nick), 'gi');
          message = message.replace(regexp, user.mention());
        }
      }

      // 2 - usernames
      for (let user of server.members) {
        const regexp = new RegExp('@' + escapeRegExp(user.username), 'gi');
        message = message.replace(regexp, user.mention());
      }

      // convert #channel
      for (let ch of server.channels) {
        if (ch.type !== 'text') continue;
        const regexp = new RegExp(escapeRegExp('#' + ch.name), 'gi');
        message = message.replace(regexp, ch.mention());
      }

      // convert @role
      for (let role of server.roles) {
        const regexp = new RegExp(escapeRegExp('@' + role.name), 'gi');
        message = message.replace(regexp, role.mention());
      }

      // send
      bot.sendMessage(channel, '[' + author + ']: ' + emojify(message));
      break;

    case 'guild':
      const [motd, names] = args;
      names.sort((a, b) => a.localeCompare(b));
      bot.setChannelTopic(channel,
        'Online: ' + names.join(', ') + ' // ' +
        'MotD: ' + emojify(unHtml(motd))
      );
      break;

    case 'sysmsg':
      [message] = args;
      bot.sendMessage(channel, message);
  }
});

bot.on('ready', () => {
  console.log('connected as %s (%s)', bot.user.username, bot.user.id);

  server = bot.servers.get('id', config['server-id']);
  if (!server) {
    console.error('server "%s" not found', config['server-id']);
    console.error('servers:');
    for (let s of bot.servers) {
      console.error('- %s (%s)', s.name, s.id);
    }
    bot.logout();
    return;
  }

  channel = server.channels.get('id', config['channel-id']);
  if (!channel || channel.type !== 'text') {
    console.error('text channel "%s" not found', config['channel-id']);
    console.error('channels:');
    for (let c of server.channels) {
      if (c.type !== 'text') continue;
      console.error('- #%s (%s)', c.name, c.id);
    }
    bot.logout();
    return;
  }

  bot.setStatus('online', 'TERA');
  console.log('routing to #%s (%s)', channel.name, channel.id);

  ipc.send('fetch');
});

bot.on('message', (message) => {
  if (!message.channel.equals(channel)) return;
  if (message.author.equals(bot.user)) return;

  const str = unemojify(message.content)
    // @user, @!user
    .replace(/<@!?(\d+)>/g, (_, mention) => {
      const m = server.members.get('id', mention);
      const d = server.detailsOf(m);
      return '@' + ((d && d.nick) || (m && m.username) || '(???)');
    })
    // #channel
    .replace(/<#(\d+)>/g, (_, mention) => {
      const m = server.channels.get('id', mention);
      return '#' + ((m && m.name) || '(???)');
    })
    // @role
    .replace(/<@&(\d+)>/g, (_, mention) => {
      const m = server.roles.get('id', mention);
      return '@' + ((m && m.name) || '(???)');
    })
    // :emoji:
    .replace(/<:(\w+):(\d+)>/g, (_, mention) => ':' + mention + ':');

  const u = message.author;
  const d = server.detailsOf(u);
  const author = (d && d.nick) || (u && u.username) || '(???)';
  ipc.send('chat', author, str);
});

bot.on('disconnected', () => {
  console.log('disconnected');
  process.exit();
});

bot.on('warn', (warn) => {
  console.warn(warn);
});

console.log('connecting...');

if (config['token']) {
  bot.loginWithToken(config['token']);
} else {
  bot.login(config['email'], config['pass']);
}

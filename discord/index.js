// config
const fs = require('fs');
const fn = process.argv[2];
if (fn == null) {
  console.error('please specify config file');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(fn, 'utf8'));

// set up bot
const Discord = require('discord.js');
const bot = new Discord.Client({
  fetchAllMembers: true,
  sync: true,
});

bot.on('ready', () => {
  console.log('connected as %s (%s)', bot.user.username, bot.user.id);
  bot.user.setActivity({game: {name: "TERA", type: 0}});
});

bot.on('warn', (warn) => {
  console.warn(warn);
});

bot.on('disconnect', () => {
  console.log('disconnected');
  process.exit();
});

// set up ipc
const IpcModule = require('./lib/ipc');
const ipc = new IpcModule(config['socket-name']);

// set up app
const app = { bot, ipc };

console.log('loading submodules...');
for (let name of ['gchat', 'entry']) {
  const submodule = require('./lib/' + name);
  app[submodule] = new submodule(app, config);
  console.log('- loaded %s', name);
}

// connect
console.log('connecting...');
bot.login(config['token']).catch((reason) => {
  console.error('failed to login:', reason);
  process.exit();
});

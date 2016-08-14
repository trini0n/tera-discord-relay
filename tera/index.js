// config
var fs = require('fs');
var fn = process.argv[2];

if (fn == null) {
  console.error('please specify config file');
  process.exit(1);
}

var config = JSON.parse(fs.readFileSync(fn, 'utf8'));

// client
var webClient = require('./lib/web');
var gameClient = require('./lib/game');

var web = new webClient(config.email, config.pass);
web.getLogin(function(err, data) {
  if (err) return;

  var game = new gameClient(data.name, data.ticket, config.character);
  game.connect({ host: config.host, port: config.port });

  for (var moduleName in config.modules) {
    var moduleConfig = config.modules[moduleName];
    game.client.dispatch.load(moduleName, moduleConfig, module);
  }
});

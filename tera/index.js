// config
var fs = require('fs');
var fn = process.argv[2];

if (fn == null) {
  console.error('please specify config file');
  process.exit(1);
}

var config = JSON.parse(fs.readFileSync(fn, 'utf8'));

// client
var webClient = require('tera-auth-ticket');
var gameClient = require('tera-proxy-game');

var describe = (function() {
  var races = ['Human', 'High Elf', 'Aman', 'Castanic', 'Popori', 'Baraka'];
  var genders = ['Male', 'Female'];

  var classes = [
    'Warrior', 'Lancer', 'Slayer', 'Berserker', 'Sorcerer', 'Archer',
    'Priest', 'Mystic', 'Reaper', 'Gunner', 'Brawler', 'Ninja'
  ];

  return function describe(character) {
    var description = '';

    // race & gender
    var race = races[character.race] || '?';
    var gender = genders[character.gender] || '?';

    if (character.race < 4) {
      description += race + ' ' + gender;
    } else {
      if (character.race === 4 && character.gender === 1) {
        description += 'Elin';
      } else {
        description += race;
      }
    }

    // class
    description += ' ' + (classes[character['class']] || '?') + ' / ';

    // level
    description += character.level;

    // return
    return description;
  };
})();

// main
var web = new webClient(config.email, config.pass);
web.getLogin(function(err, data) {
  if (err) return;

  var connection = new gameClient.Connection();
  var client = new gameClient.FakeClient(connection);
  var srvConn = connection.connect(client, { host: config.host, port: config.port });

  function closeClient() {
    var cl = client;
    if (cl) {
      client = null;
      cl.close();
    }

    setImmediate(function() {
      process.exit();
    });
  }

  // set up core bot features
  connection.dispatch.load('<core>', function coreModule(dispatch) {
    // `connect` handler
    client.on('connect', function onConnect() {
      // version check
      dispatch.toServer('cCheckVersion', {
        version: [
          { index: 0, value: 306637 },
          { index: 1, value: 307847 },
        ]
      });

      // authorization
      dispatch.toServer('cLoginArbiter', {
        unk1: 0,
        unk2: 0,
        unk3: 2,
        unk4: 9901, // patch version
        name: data.name,
        ticket: new Buffer(data.ticket),
      });
    });

    // get character list
    dispatch.hook('sLoginAccountInfo', function() {
      dispatch.toServer('cGetUserList');
    });

    dispatch.hook('sGetUserList', function(event) {
      // parse character list
      var characters = {};
      for (var i = 0, len = event.characters.length; i < len; i++) {
        var character = event.characters[i];
        characters[character.name.toLowerCase()] = {
          id: character.id,
          description: character.name + ' [' + describe(character) + ']',
        };
      }

      // find matching character
      character = characters[config.character.toLowerCase()];
      if (!character) {
        console.error('[client] no character "' + config.character + '"');
        console.error('[client] character list:');
        for (var name in characters) {
          character = characters[name];
          console.error('- ' + character.description + ' (id: ' + character.id + ')');
        }
      } else {
        console.log('[client] logging onto ' + character.description + ' (id: ' + character.id + ')');
        dispatch.toServer('cSelectUser', {
          id: character.id,
          unk: 0,
        });
      }
    });

    // login sequence
    dispatch.hook('sLoadTopo', function() {
      dispatch.toServer('cLoadTopoFin');
    });

    // ping-pong
    dispatch.hook('sPing', function() {
      dispatch.toServer('cPong');
    });

    // terminate when connection ends
    client.on('close', function onClose() {
      closeClient();
    });
  });

  // load modules
  for (var moduleName in config.modules) {
    var moduleConfig = config.modules[moduleName];
    connection.dispatch.load('./app/' + moduleName, module, moduleConfig);
  }

  // logging
  srvConn.setTimeout(30 * 1000);

  srvConn.on('connect', function onConnect() {
    console.log('<connected to ' + srvConn.remoteAddress + ":" + srvConn.remotePort + '>');
  });

  srvConn.on('timeout', function onTimeout() {
    console.log('<timeout>');
    closeClient();
  });

  srvConn.on('close', function onClose() {
    console.log('<disconnected>');
    process.exit();
  });

  srvConn.on('error', function onError(err) {
    console.warn(err);
  });
});

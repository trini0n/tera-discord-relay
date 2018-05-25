// config
const fs = require('fs');
const fn = process.argv[2];

if (fn == null) {
  console.error('please specify config file');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(fn, 'utf8'));

// client
const webClient = require('tera-auth-ticket');
const { Connection, FakeClient } = require('tera-proxy-game');

const describe = (() => {
  const races = ['Human', 'High Elf', 'Aman', 'Castanic', 'Popori', 'Baraka'];
  const genders = ['Male', 'Female'];

  const classes = [
    'Warrior', 'Lancer', 'Slayer', 'Berserker', 'Sorcerer', 'Archer',
    'Priest', 'Mystic', 'Reaper', 'Gunner', 'Brawler', 'Ninja', 'Valkyrie',
  ];

  return function describe(character) {
    let description = '';

    // race & gender
    const race = races[character.race] || '?';
    const gender = genders[character.gender] || '?';

    if (character.race < 4) {
      description += `${race} ${gender}`;
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
const web = new webClient(config.email, config.pass);
web.getLogin((err, data) => {
  if (err) return;

  const connection = new Connection();
  const client = new FakeClient(connection);
  const srvConn = connection.connect(client, { host: config.host, port: config.port });

  let closed = false;

  function closeClient() {
    if (closed) return;

    closed = true;
    client.close();

    setImmediate(() => {
      process.exit();
    });
  }

  connection.dispatch.setProtocolVersion(config.protocolVersion);
  
  // set up core bot features
  connection.dispatch.load('<core>', function coreModule(dispatch) {
    // `connect` handler
    client.on('connect', () => {
      // authorization
      dispatch.toServer('C_LOGIN_ARBITER', 1, {
        unk1: 0,
        unk2: 0,
        unk3: 2,
        patchVersion: config.patchVersion,
        name: data.name,
        ticket: new Buffer(data.ticket),
      });
    });

    // get character list
    dispatch.hook('S_LOGIN_ACCOUNT_INFO', 1, () => {
      dispatch.toServer('C_GET_USER_LIST', 1);
    });

    dispatch.hook('S_GET_USER_LIST', 1, (event) => {
      // parse character list
      const characters = new Map();
      for (const character of event.characters) {
        characters.set(character.name.toLowerCase(), {
          id: character.id,
          description: `${character.name} [${describe(character)}]`,
        });
      }

      // find matching character
      const character = characters.get(config.character.toLowerCase());
      if (!character) {
        console.error(`[client] no character "${config.character}"`);
        console.error('[client] character list:');
        for (const char of characters.values()) {
          console.error(`- ${char.description} (id: ${char.id})`);
        }
      } else {
        console.log(`[client] logging onto ${character.description} (id: ${character.id})`);
        dispatch.toServer('C_SELECT_USER', 1, {
          id: character.id,
          unk: 0,
        });
      }
    });

    // login sequence
    dispatch.hook('S_LOAD_TOPO', 1, () => {
      dispatch.toServer('C_LOAD_TOPO_FIN', 1);
    });

    // ping-pong
    dispatch.hook('S_PING', 1, () => {
      dispatch.toServer('C_PONG', 1);
    });

    // terminate when connection ends
    client.on('close', () => {
      closeClient();
    });
  });

  // load modules
  for (const moduleName in config.modules) {
    const moduleConfig = config.modules[moduleName];
    connection.dispatch.load('./app/' + moduleName, module, moduleConfig);
  }

  // logging
  srvConn.setTimeout(30 * 1000);

  srvConn.on('connect', () => {
    console.log(`<connected to ${srvConn.remoteAddress}:${srvConn.remotePort}>`);
  });

  srvConn.on('timeout', () => {
    console.log('<timeout>');
    closeClient();
  });

  srvConn.on('close', () => {
    console.log('<disconnected>');
    process.exit();
  });

  srvConn.on('error', (err) => {
    console.warn(err);
  });
});
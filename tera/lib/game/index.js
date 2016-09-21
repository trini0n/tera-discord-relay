var Dispatch = require('./dispatch');
var Connection = require('./connection');

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

//

function GameClient(name, ticket, desiredCharacter) {
  var dispatch = new Dispatch;
  this.client = new Connection(dispatch);

  // `connect` handler
  this.client.on('connect', function onConnect() {
    // version check
    dispatch.toServer('cCheckVersion', {
      version: [
        { index: 0, value: 0x0004AA91 },
        { index: 1, value: 0x0004AF1B },
      ]
    });

    // authorization
    dispatch.toServer('cLoginArbiter', {
      unk1: 0,
      unk2: 0,
      unk3: 2,
      unk4: 4702, // patch version
      name: name,
      ticket: new Buffer(ticket),
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
    character = characters[desiredCharacter.toLowerCase()];
    if (!character) {
      console.error('[client] no character "' + desiredCharacter + '"');
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
  this.client.on('close', function onClose() {
    process.exit();
  });
}

GameClient.prototype.connect = function() {
  // pass through for now
  return this.client.connect.apply(this.client, arguments);
};

GameClient.prototype.send = function() {
  // pass through for now
  return this.client.send.apply(this.client, arguments);
};

module.exports = GameClient;

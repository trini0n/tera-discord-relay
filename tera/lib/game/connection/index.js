var net = require('net');
var util = require('util');
var events = require('events');

var Encryption = require('./encryption');
var PacketBuffer = require('./packetBuffer');

function Connection(dispatch) {
  this.dispatch = dispatch;

  this.state = -1;
  this.session = new Encryption;
  this.serverBuffer = new PacketBuffer;

  for (var i = 0; i < 128; i++) {
    this.session.clientKeys[0][i] = 255 * Math.random();
    this.session.clientKeys[1][i] = 255 * Math.random();
  }

  this.dispatch.connection = this;
}

util.inherits(Connection, events.EventEmitter); // TODO `extends` for ES6

Connection.prototype.connect = function(opt) {
  var self = this;
  self.client = net.connect(opt);
  self.client.setNoDelay(true);
  self.client.setTimeout(30 * 1000);

  self.client.on('connect', function onConnect() {
    console.log('<connected to ' + self.client.remoteAddress + ":" + self.client.remotePort + '>');
    self.emit('init');
  });

  self.client.on('data', function onData(data) {
    switch (self.state) {
      case -1:
        if (data.readUInt32LE(0) === 1) {
          self.state = 0;
          self.client.write(self.session.clientKeys[0]);
        }
        break;

      case 0:
        if (data.length === 128) {
          data.copy(self.session.serverKeys[0]);
          self.state = 1;
          self.client.write(self.session.clientKeys[1]);
        }
        break;

      case 1:
        if (data.length === 128) {
          data.copy(self.session.serverKeys[1]);
          self.session.init();
          self.state = 2;
          self.emit('connect');
        }
        break;

      case 2:
        self.session.encrypt(data);
        self.serverBuffer.write(data);

        while (data = self.serverBuffer.read()) {
          var opcode = data.readUInt16LE(2);
          self.dispatch.handle(opcode, data);
        }
        break;
    }
  });

  self.client.on('timeout', function onTimeout() {
    console.log('<timeout>');
    self.client.end();
    self.client.destroy();
  });

  self.client.on('close', function onClose() {
    console.log('<disconnected>');
    self.emit('close');
  });

  self.client.on('error', function onError(err) {
    console.warn(err);
    self.emit('error', err);
  });
};

Connection.prototype.sendServer = function(data) {
  if (this.client != null && this.state === 2) {
    this.session.decrypt(data);
    this.client.write(data);
    return true;
  }
  return false;
};

module.exports = Connection;

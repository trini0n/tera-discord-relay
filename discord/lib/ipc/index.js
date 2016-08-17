'use strict';

const events = require('events');
const IPC = require('./ipc');

const emitter = new events.EventEmitter;

emitter.init = function init(socketName) {
  if (this.ipc) throw new Error('IpcModule already instantiated');

  let path;
  if (process.platform === 'win32') {
    path = '\\\\.\\pipe\\' + socketName;
  } else {
    path = "/tmp/" + socketName + ".sock";
  }

  this.ipc = new IPC.server(path, this.emit.bind(this));
};

emitter.send = function send() {
  if (!this.ipc) return false;
  this.ipc.send(...arguments);
}

module.exports = emitter;

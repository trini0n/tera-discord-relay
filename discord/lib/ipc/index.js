const events = require('events');
const IPC = require('./ipc');

class IpcModule extends events.EventEmitter {
  constructor(socketName) {
    super();

    let path;
    if (process.platform === 'win32') {
      path = `\\\\.\\pipe\\${socketName}`;
    } else {
      path = `/tmp/${socketName}.sock`;
    }

    this.ipc = new IPC.server(path, this.emit.bind(this));
  }

  send() {
    this.ipc.send(...arguments);
  }
}

module.exports = IpcModule;

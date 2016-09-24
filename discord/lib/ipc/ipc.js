const net = require('net');

/*************
 * IpcServer *
 *************/
class IpcServer {
  constructor(path, cb) {
    this.clients = [];
    this.queue = [];

    this.server = net.createServer((client) => {
      client.setEncoding('utf8');
      client.setNoDelay(true);
      this.clients.push(client);

      // set up events
      let buffer = '';
      client.on('data', (data) => {
        data = (buffer + data).split('\n');
        buffer = data.pop();
        for (let line of data) {
          cb.apply(cb, JSON.parse(line));
        }
      });

      client.on('end', () => {
        const index = this.clients.indexOf(client);
        if (index !== -1) {
          this.clients.splice(index, 1);
        }
      });

      // flush queue
      if (this.queue.length > 0) {
        client.write(this.queue.join(''));
        this.queue = [];
      }
    });

    this.server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        require('fs').unlink(path, (err2) => {
          if (err2) throw err2; // error freeing socket
          this.server.listen(path);
        });
      } else {
        throw err;
      }
    });

    this.server.listen(path);
  }

  send(...args) {
    const line = JSON.stringify(args) + '\n';
    const len = this.clients.length;
    if (len > 0) {
      for (let client of this.clients) {
        client.write(line);
      }
    } else {
      this.queue.push(line);
    }
  }
}

/*************
 * IpcClient *
 *************/
class IpcClient {
  constructor(path, cb) {
    this.path = path;
    this.cb = cb;

    this.socket = null;
    this.queue = [];

    this.listeners = {};
    this._connect();
  }

  _connect() {
    this.socket = net.connect(this.path, () => {
      this.socket.setEncoding('utf8');
      this.socket.setNoDelay(true);

      // flush queue
      if (this.queue.length > 0) {
        this.socket.write(this.queue.join(''));
        this.queue = [];
      }
    });

    let buffer = '';
    this.socket.on('data', (data) => {
      data = (buffer + data).split('\n');
      buffer = data.pop();
      for (let line of data) {
        this.cb.apply(this.cb, JSON.parse(line));
      }
    });

    this.socket.on('error', () => {
      this.socket = null;
      setTimeout(this._connect.bind(this), 3000);
    });
  }

  send(...args) {
    const line = JSON.stringify(args) + '\n';
    if (this.socket != null) {
      this.socket.write(line);
    } else {
      this.queue.push(line);
    }
  }
}

/***********
 * Exports *
 ***********/
module.exports = { server: IpcServer, client: IpcClient };

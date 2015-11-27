var net = require('net');

/*************
 * IpcServer *
 *************/
function IpcServer(path, cb) {
  var self = this;

  self.clients = [];
  self.queue = [];

  self.server = net.createServer(function(client) {
    client.setEncoding('utf8');
    client.setNoDelay(true);
    self.clients.push(client);

    // set up events
    var buffer = '';
    client.on('data', function(data) {
      data = (buffer + data).split('\n');
      buffer = data.pop();
      for (var i = 0, len = data.length; i < len; i++) {
        cb.apply(cb, JSON.parse(data[i]));
      }
    });

    client.on('end', function() {
      var index = self.clients.indexOf(client);
      if (index !== -1) {
        self.clients.splice(index, 1);
      }
    });

    // flush queue
    if (self.queue.length > 0) {
      client.write(self.queue.join(''));
      self.queue = [];
    }
  });

  self.server.listen(path);
}

IpcServer.prototype.send = function() {
  var line = JSON.stringify([].slice.call(arguments)) + '\n';
  var len = this.clients.length;
  if (len > 0) {
    for (var i = 0; i < len; i++) {
      this.clients[i].write(line);
    }
  } else {
    this.queue.push(line);
  }
};

/*************
 * IpcClient *
 *************/
function IpcClient(path, cb) {
  this.path = path;
  this.cb = cb;

  this.socket = null;
  this.queue = [];

  this.listeners = {};
  this._connect();
}

IpcClient.prototype._connect = function() {
  var self = this;
  self.socket = net.connect(self.path, function() {
    self.socket.setEncoding('utf8');
    self.socket.setNoDelay(true);

    // flush queue
    if (self.queue.length > 0) {
      self.socket.write(self.queue.join(''));
      self.queue = [];
    }
  });

  var buffer = '';
  self.socket.on('data', function(data) {
    data = (buffer + data).split('\n');
    buffer = data.pop();
    for (i = 0, len = data.length; i < len; i++) {
      self.cb.apply(self.cb, JSON.parse(data[i]));
    }
  });

  self.socket.on('error', function() {
    self.socket = null;
    setTimeout(self._connect.bind(self), 3000);
  });
};

IpcClient.prototype.send = function() {
  var line = JSON.stringify([].slice.call(arguments)) + '\n';
  if (this.socket != null) {
    this.socket.write(line);
  } else {
    this.queue.push(line);
  }
};

/***********
 * Exports *
 ***********/
module.exports = { server: IpcServer, client: IpcClient };

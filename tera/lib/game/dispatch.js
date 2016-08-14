var protocol = require('tera-data').protocol;

function Dispatch() {
  this.connection = null;
  this.modules = {};
  this.hooks = { raw: {}, pre: {} };
}

Dispatch.prototype.close = function close() {
  for (var name in this.modules) {
    // TODO share code with unload()
    var module = this.modules[name];
    if (typeof module.destructor === 'function') {
      module.destructor();
    }
  }
  this.modules = {};
  this.hooks = { raw: {}, pre: {} };
};

Dispatch.prototype.load = function load(name, config, from) {
  if (from == null) from = module;

  try {
    var mod = from.require('./app/' + name);
    this.modules[name] = new mod(this, config);
    console.log('[dispatch] loaded "%s"', name);
    return true;
  } catch (e) {
    console.error('[dispatch] load: error initializing module "%s"', name);
    console.error(e.stack);
    return false;
  }
};

Dispatch.prototype.unload = function unload(name) {
  var module = this.modules[name];
  if (module == null) {
    console.warn('[dispatch] unload: cannot unload non-loaded module "%s"', name);
    return false;
  }
  if (typeof module.destructor === 'function') {
    module.destructor();
  }
  delete this.modules[name];
  return true;
};

Dispatch.prototype.hook = function hook(name, type, cb) {
  // optional arg `type` defaults 'pre'
  if (cb == null) {
    cb = type;
    type = 'pre';
  }

  var code;
  if (name === '*') {
    type = 'raw';
    code = name;
  } else {
    code = protocol.map.name[name];
  }

  var hooks = this.hooks[type];
  if (hooks == null) {
    console.warn('[dispatch] hook: unexpected hook type "%s"', type);
    hooks = this.hooks.pre;
  }

  if (hooks[code] == null) {
    hooks[code] = [];
  }

  hooks[code].push(cb);
};

Dispatch.prototype.unhook = function unhook(name, type, cb) {
  // optional arg `type` defaults 'pre'
  if (cb == null) {
    cb = type;
    type = 'pre';
  }

  var code;
  if (name === '*') {
    type = 'raw';
    code = name;
  } else {
    code = protocol.map.name[name];
  }

  var hooks = this.hooks[type];
  if (hooks == null) {
    console.warn('[dispatch] unhook: unexpected hook type "%s"', type);
    hooks = this.hooks.pre;
  }

  var index = hooks[code].indexOf(cb);
  if (index === -1) {
    console.error('[dispatch] unhook: could not find cb');
    return;
  }

  return hooks[code].splice(index, 1);
};

Dispatch.prototype.toClient = function toClient(name, data) {
  if (this.connection == null) return false;
  if (name.constructor === Buffer) {
    data = name;
  } else {
    try {
      data = protocol.write(name, data);
    } catch (e) {
      console.error('[dispatch] failed to generate message: %s', name);
      console.error('error: %s', e.message);
      console.error('data:');
      console.error(data);
      console.error('stack:');
      console.error(e.stack);
      return false;
    }
  }
  this.connection.sendClient(data);
  return true;
};

Dispatch.prototype.toServer = function toServer(name, data) {
  if (this.connection == null) return false;
  if (name.constructor === Buffer) {
    data = name;
  } else {
    try {
      data = protocol.write(name, data);
    } catch (e) {
      console.error('[dispatch] failed to generate message: %s', name);
      console.error('error: %s', e.message);
      console.error('data:');
      console.error(data);
      console.error('stack:');
      console.error(e.stack);
      return false;
    }
  }
  this.connection.sendServer(data);
  return true;
};

Dispatch.prototype.handle = function handle(code, data, fromServer) {
  var hooks;
  var i, len, result;

  // raw * hooks
  hooks = this.hooks.raw['*'];
  if (hooks != null) {
    for (i = 0, len = hooks.length; i < len; i++) {
      result = hooks[i](code, data, fromServer);
      if (result != null) {
        if (result.constructor === Buffer) {
          data = result;
        } else if (result === false) {
          return false;
        }
      }
    }
  }

  // raw named hooks
  hooks = this.hooks.raw[code];
  if (hooks != null) {
    for (i = 0, len = hooks.length; i < len; i++) {
      result = hooks[i](code, data, fromServer);
      if (result != null) {
        if (result.constructor === Buffer) {
          data = result;
        } else if (result === false) {
          return false;
        }
      }
    }
  }

  // pre hooks
  hooks = this.hooks.pre[code];
  if (hooks != null) {
    var event = protocol.parse(code, data);
    var changed = false;
    for (i = 0, len = hooks.length; i < len; i++) {
      result = hooks[i](event);
      if (result === true) {
        changed = true;
      } else if (result === false) {
        return false;
      }
    }
    if (changed) {
      data = protocol.write(code, event);
    }
  }

  // return value
  return data;
};

module.exports = Dispatch;

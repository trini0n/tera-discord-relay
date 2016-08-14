// original C# source:
// https://github.com/P5yl0/TeraEmulator_2117a/tree/master/Tera_Emulator_Source_2117/GameServer/Crypt

var sha1 = require('./sha1');

/**************
 * cryptorKey *
 **************/
function cryptorKey(size, pos2) {
  this.size = size;
  this.sum = 0;
  this.key = 0;
  this.pos1 = 0;
  this.pos2 = pos2;
  this.buffer = new Uint32Array(this.size);
};

/***********
 * Cryptor *
 ***********/
function Cryptor() {
  this.changeData = 0;
  this.changeLen = 0;
  this.keys = [
    new cryptorKey(55, 31),
    new cryptorKey(57, 50),
    new cryptorKey(58, 39),
  ];
}

Cryptor.fill = function(key) {
  var result = new Buffer(680);
  result[0] = 128;
  for (var i = 1; i < 680; i++) {
    result[i] = key[i % 128];
  }
  return result;
};

Cryptor.prototype.generate = function(key) {
  var i, j, buffer = Cryptor.fill(key);
  for (i = 0; i < 680; i += 20) {
    var sha = new sha1();
    sha.update(buffer);
    sha = sha.hash();
    for (j = 0; j < 20; j += 4) {
      sha.copy(buffer, i + j, j, j + 4);
    }
  }
  for (i = 0; i < 55; i++) {
    this.keys[0].buffer[i] = buffer.readUInt32LE(i * 4);
  }
  for (i = 0; i < 57; i++) {
    this.keys[1].buffer[i] = buffer.readUInt32LE(i * 4 + 220);
  }
  for (i = 0; i < 58; i++) {
    this.keys[2].buffer[i] = buffer.readUInt32LE(i * 4 + 448);
  }
};

Cryptor.prototype.apply = function(buf, size) {
  var i, j, k, result, t1, t2, t3;
  var keys = this.keys;
  var len = buf.length;
  var pre = (size < this.changeLen) ? size : this.changeLen;

  if (pre !== 0) {
    for (j = 0; j < pre; j++) {
      buf[j] ^= this.changeData >>> (8 * (4 - this.changeLen + j));
    }
    this.changeLen -= pre;
    size -= pre;
  }

  for (i = pre; i < len - 3; i += 4) {
    result = keys[0].key & keys[1].key | keys[2].key & (keys[0].key | keys[1].key);
    for (j = 0; j < 3; j++) {
      k = keys[j];
      if (result === k.key) {
        t1 = k.buffer[k.pos1];
        t2 = k.buffer[k.pos2];
        t3 = (t1 <= t2 ? t1 : t2);
        k.sum = ((t1 + t2) & 0xFFFFFFFF) >>> 0;
        k.key = +(t3 > k.sum);
        k.pos1 = (k.pos1 + 1) % k.size;
        k.pos2 = (k.pos2 + 1) % k.size;
      }
      buf[i    ] ^= k.sum;
      buf[i + 1] ^= k.sum >>> 8;
      buf[i + 2] ^= k.sum >>> 16;
      buf[i + 3] ^= k.sum >>> 24;
    }
  }

  var remain = size & 3;
  if (remain !== 0) {
    result = keys[0].key & keys[1].key | keys[2].key & (keys[0].key | keys[1].key);
    this.changeData = 0;
    for (j = 0; j < 3; j++) {
      k = keys[j];
      if (result === k.key) {
        t1 = k.buffer[k.pos1];
        t2 = k.buffer[k.pos2];
        t3 = (t1 <= t2 ? t1 : t2);
        k.sum = ((t1 + t2) & 0xFFFFFFFF) >>> 0;
        k.key = +(t3 > k.sum);
        k.pos1 = (k.pos1 + 1) % k.size;
        k.pos2 = (k.pos2 + 1) % k.size;
      }
      this.changeData ^= k.sum;
    }

    for (j = 0; j < remain; j++) {
      buf[size + pre - remain + j] ^= this.changeData >>> (j * 8);
    }

    this.changeLen = 4 - remain;
  }
};

/***********
 * Session *
 ***********/
// helpers
function shiftKey(tgt, src, n) {
  var len = src.length;
  if (n > 0) {
    src.copy(tgt, 0, n);
    src.copy(tgt, len - n);
  } else {
    src.copy(tgt, 0, len + n);
    src.copy(tgt, -n);
  }
  return tgt;
};

function xorKey(tgt, key1, key2) {
  var len = Math.min(key1.length, key2.length);
  for (var i = 0; i < len; i++) {
    tgt[i] = key1[i] ^ key2[i];
  }
};

function Session() {
  this.encryptor = new Cryptor;
  this.decryptor = new Cryptor;
  this.clientKeys = [new Buffer(128), new Buffer(128)];
  this.serverKeys = [new Buffer(128), new Buffer(128)];
}

Session.prototype.init = function() {
  var c1 = this.clientKeys[0];
  var c2 = this.clientKeys[1];
  var s1 = this.serverKeys[0];
  var s2 = this.serverKeys[1];
  var t1 = new Buffer(128);
  var t2 = new Buffer(128);
  shiftKey(t1, s1, -67);
  xorKey(t2, t1, c1);
  shiftKey(t1, c2, 29);
  xorKey(t2, t1, t2);
  this.decryptor.generate(t2);
  shiftKey(t1, s2, -41);
  this.decryptor.apply(t1, 128);
  this.encryptor.generate(t1.slice(0, 128));
};

Session.prototype.encrypt = function(data) {
  return this.encryptor.apply(data, data.length);
};

Session.prototype.decrypt = function(data) {
  return this.decryptor.apply(data, data.length);
};

/***********
 * exports *
 ***********/
module.exports = Session;

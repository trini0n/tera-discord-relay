# original C# source:
# https://github.com/P5yl0/TeraEmulator_2117a/tree/master/Tera_Emulator_Source_2117/GameServer/Crypt

sha1 = require './sha1'

cryptorKey = (@size, @pos2) ->
  @sum = 0
  @key = 0
  @pos1 = 0
  @buffer = new Uint32Array @size
  return

class Cryptor
  constructor: ->
    @changeData = 0
    @changeLen = 0
    @keys = [
      new cryptorKey(55, 31)
      new cryptorKey(57, 50)
      new cryptorKey(58, 39)
    ]

  @fill: (key) ->
    result = new Buffer 680
    result[0] = 128
    result[i] = key[i % 128] for i in [1...680]
    result

  generate: (key) ->
    buffer = Cryptor.fill key
    for i in [0...680] by 20
      sha = new sha1()
      sha.update buffer
      sha = sha.hash()
      for j in [0...20] by 4
        sha.copy buffer, i + j, j, j + 4

    for i in [0...55]
      @keys[0].buffer[i] = buffer.readUInt32LE(i * 4)

    for i in [0...57]
      @keys[1].buffer[i] = buffer.readUInt32LE(i * 4 + 220)

    for i in [0...58]
      @keys[2].buffer[i] = buffer.readUInt32LE(i * 4 + 448)

    return

  apply: (buf, size) ->
    keys = @keys
    len = buf.length
    pre = (if size < @changeLen then size else @changeLen)

    if pre isnt 0
      for j in [0...pre] by 1
        buf[j] ^= @changeData >>> (8 * (4 - @changeLen + j))
      @changeLen -= pre
      size -= pre

    for i in [pre...len - 3] by 4
      result = keys[0].key & keys[1].key | keys[2].key & (keys[0].key | keys[1].key)

      for j in [0...3]
        k = keys[j]
        if result is k.key
          t1 = k.buffer[k.pos1]
          t2 = k.buffer[k.pos2]
          t3 = (if t1 <= t2 then t1 else t2)
          k.sum = ((t1 + t2) & 0xFFFFFFFF) >>> 0
          k.key = +(t3 > k.sum)
          k.pos1 = (k.pos1 + 1) % k.size
          k.pos2 = (k.pos2 + 1) % k.size
        buf[i    ] ^= k.sum
        buf[i + 1] ^= k.sum >>> 8
        buf[i + 2] ^= k.sum >>> 16
        buf[i + 3] ^= k.sum >>> 24

    remain = size & 3
    if remain isnt 0
      result = keys[0].key & keys[1].key | keys[2].key & (keys[0].key | keys[1].key)
      @changeData = 0
      
      for j in [0...3]
        k = keys[j]
        if result is k.key
          t1 = k.buffer[k.pos1]
          t2 = k.buffer[k.pos2]
          t3 = (if t1 <= t2 then t1 else t2)
          k.sum = ((t1 + t2) & 0xFFFFFFFF) >>> 0
          k.key = +(t3 > k.sum)
          k.pos1 = (k.pos1 + 1) % k.size
          k.pos2 = (k.pos2 + 1) % k.size
        @changeData ^= k.sum

      for j in [0...remain] by 1
        buf[size + pre - remain + j] ^= @changeData >>> (j * 8)

      @changeLen = 4 - remain
    return

shiftKey = (tgt, src, n, dir = true) ->
  len = src.length
  unless dir
    src.copy tgt, 0, n
    src.copy tgt, len - n
  else
    src.copy tgt, 0, len - n
    src.copy tgt, n
  tgt

xorKey = (tgt, key1, key2) ->
  len = Math.min key1.length, key2.length
  tgt[i] = key1[i] ^ key2[i] for i in [0...len] by 1
  return

class Session
  constructor: ->
    @encryptor = new Cryptor
    @decryptor = new Cryptor
    @clientKeys = [new Buffer(128), new Buffer(128)]
    @serverKeys = [new Buffer(128), new Buffer(128)]

  init: ->
    [c1, c2] = @clientKeys
    [s1, s2] = @serverKeys

    t1 = new Buffer 128
    t2 = new Buffer 128

    shiftKey t1, s1, 31
    xorKey t2, t1, c1
    shiftKey t1, c2, 17, false
    xorKey t2, t1, t2
    @decryptor.generate t2

    shiftKey t1, s2, 79
    @decryptor.apply t1, 128
    @encryptor.generate t1[0...128]
    return

  encrypt: (data) ->
    @encryptor.apply data, data.length

  decrypt: (data) ->
    @decryptor.apply data, data.length

module.exports = Session

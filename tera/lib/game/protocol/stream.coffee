class Int64
  constructor: (@low, @high) ->
  equals: (n) -> @low is n.low and @high is n.high

module.exports =
  Readable: class Readable
    constructor: (@buffer, @position = 0) ->

    seek: (n) ->
      @position = n

    skip: (n) ->
      @position += n

    byte: ->
      @buffer[@position++]

    bytes: (n) ->
      @buffer.slice @position, @position += n

    uint16: ->
      ret = @buffer.readUInt16LE @position
      @position += 2
      ret

    uint32: ->
      ret = @buffer.readUInt32LE @position
      @position += 4
      ret

    uint64: ->
      new Int64 @uint32(), @uint32()

    int16: ->
      ret = @buffer.readInt16LE @position
      @position += 2
      ret

    int32: ->
      ret = @buffer.readInt32LE @position
      @position += 4
      ret

    int64: ->
      new Int64 @uint32(), @int32()

    float: ->
      ret = @buffer.readFloatLE @position
      @position += 4
      ret

    string: ->
      ret = ""
      ret += String.fromCharCode c while c = @uint16()
      ret

  Writeable: class Writeable
    constructor: (@length) ->
      @buffer = new Buffer @length
      @position = 0

    seek: (n) ->
      @position = n

    skip: (n) ->
      @position += n

    byte: (n) ->
      @buffer[@position++] = n

    bytes: (buf) ->
      buf.copy @buffer, @position
      @position += buf.length

    uint16: (n) ->
      @buffer.writeUInt16LE n, @position
      @position += 2

    uint32: (n) ->
      @buffer.writeUInt32LE n, @position
      @position += 4

    uint64: (obj) ->
      @uint32 obj.low
      @uint32 obj.high

    int16: (n) ->
      @buffer.writeInt16LE n, @position
      @position += 2

    int32: (n) ->
      @buffer.writeInt32LE n, @position
      @position += 4

    int64: (obj) ->
      @uint32 obj.low
      @int32 obj.high

    float: (n) ->
      @buffer.writeFloatLE n, @position
      @position += 4

    string: (str) ->
      @uint16 c.charCodeAt 0 for c in str + '\0'
      return

# for some reason, this sha1 implementation produces different output
# we can probably simplify this and use the standard functions if we
# can figure out what this version does differently

# original C# source:
# https://github.com/P5yl0/TeraEmulator_2117a/blob/master/Tera_Emulator_Source_2117/GameServer/Crypt/Sha.cs

leftRotate = (x, n) -> (x << n) | (x >>> (32 - n))

module.exports = class Sha1
  constructor: ->
    @digest = [
      0x67452301
      0xEFCDAB89
      0x98BADCFE
      0x10325476
      0xC3D2E1F0
    ]
    @block = new Buffer 64
    @blockIndex = 0
    @lengthHigh = 0
    @lengthLow = 0
    @computed = false

  update: (buffer) ->
    for c in buffer
      @block[@blockIndex++] = c
      @lengthLow += 8
      @lengthLow &= 0xFFFFFFFF
      if @lengthLow is 0
        @lengthHigh++
        @lengthHigh &= 0xFFFFFFFF
      @processMessageBlock() if @blockIndex is 64
    return

  processMessageBlock: ->
    w = Array 80
    
    # initialize the first 16 words in the array W
    for t in [0...16]
      w[t]  = (@block[t * 4    ]) << 24
      w[t] |= (@block[t * 4 + 1]) << 16
      w[t] |= (@block[t * 4 + 2]) << 8
      w[t] |= (@block[t * 4 + 3])

    for t in [16...80]
      w[t] = w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16]

    [a, b, c, d, e] = @digest
    for t in [0...80]
      temp = leftRotate(a, 5) + e + w[t]
      if t < 20
        temp += (b & c) | ((~b) & d)
        temp += 0x5A827999
      else if t < 40
        temp += (b ^ c ^ d)
        temp += 0x6ED9EBA1
      else if t < 60
        temp += (b & c) | (b & d) | (c & d)
        temp += 0x8F1BBCDC
      else # t < 80
        temp += (b ^ c ^ d)
        temp += 0xCA62C1D6
      e = d
      d = c
      c = leftRotate b, 30
      b = a
      a = temp & 0xFFFFFFFF

    @digest[0] += (a >>> 0)
    @digest[1] += (b >>> 0)
    @digest[2] += (c >>> 0)
    @digest[3] += (d >>> 0)
    @digest[4] += (e >>> 0)
    @blockIndex = 0
    return

  padMessage: ->  
    # Check to see if the current message block is too small to hold
    # the initial padding bits and length.  If so, we will pad the
    # block, process it, and then continue padding into a second
    # block.
    @block[@blockIndex++] = 0x80

    if @blockIndex > 56
      @block[@blockIndex++] = 0 while @blockIndex < 64
      @processMessageBlock()

    @block[@blockIndex++] = 0 while @blockIndex < 56

    # store the message length as the last 8 octets
    @block[56] = @lengthHigh >> 24
    @block[57] = @lengthHigh >> 16
    @block[58] = @lengthHigh >> 8
    @block[59] = @lengthHigh
    @block[60] = @lengthLow >> 24
    @block[61] = @lengthLow >> 16
    @block[62] = @lengthLow >> 8
    @block[63] = @lengthLow

    @processMessageBlock()
    return

  hash: ->
    unless @computed
      @padMessage()
      @computed = true

    out = new Buffer 20
    for t in [0...5]
      out[t * 4    ] = @digest[t]
      out[t * 4 + 1] = @digest[t] >> 8
      out[t * 4 + 2] = @digest[t] >> 16
      out[t * 4 + 3] = @digest[t] >> 24
    out

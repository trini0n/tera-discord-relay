module.exports = class PacketBuffer
  constructor: ->
    @buffer = null
    @position = 0
    @out = []

  write: (data) ->
    # we'll chop off the front of `data` with each loop
    while data.length > 0
      # if we have a buffer prepared, we should append to it first
      if @buffer
        # if our buffer size is less than 2, we'll need to compute the full size
        if @buffer.length < 2
          old = @buffer[0]            # save old value
          size = (data[0] << 8) + old # convert little-endian
          @buffer = new Buffer size   # make new buffer
          @buffer[0] = old            # write old value
          @position = 1               # update position

        # write as many bytes as we can
        remaining = Math.min data.length, @buffer.length - @position
        data.copy @buffer, @position, 0, remaining
        @position += remaining

        # if we filled the buffer, push it
        if @position is @buffer.length
          @out.push @buffer
          @buffer = null
          @position = 0

        # chop off the front and keep going
        data = data.slice remaining
        continue

      # if it's too small to read the size value, just save it in the buffer and
      # we'll hopefully get to it the next time around
      if data.length < 2
        @buffer = new Buffer data
        @position = data.length
        break

      # otherwise, read the size value, and if it's bigger than the size of the
      # data we have, we should save it in the buffer
      size = data.readUInt16LE 0
      if size > data.length
        @buffer = new Buffer size
        data.copy @buffer
        @position = data.length
        break

      # otherwise, just push it and chop off the front, then keep going
      @out.push data.slice 0, size
      data = data.slice size

    return

  read: ->
    @out.shift()

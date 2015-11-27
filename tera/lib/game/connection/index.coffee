#
# requires
#
net = require 'net'
events = require 'events'

Encryption = require './encryption'
PacketBuffer = require './packetBuffer'

#
# helpers
#
_toString = (buf) ->
  s = []
  for n in buf
    c = n.toString 16
    s.push "00#{c}"[-2..].toUpperCase()
  s.join ' '

#
# exports
#
module.exports = class Connection extends events.EventEmitter
  constructor: (@dispatch) ->
    @state = -1
    @session = new Encryption
    @serverBuffer = new PacketBuffer

    for i in [0...128]
      @session.clientKeys[0][i] = 255 * Math.random()
      @session.clientKeys[1][i] = 255 * Math.random()

    @dispatch.connection = @

  connect: (opt) ->
    @client = net.connect opt
    @client.setNoDelay true

    @client.on 'connect', =>
      console.log "<connected to #{@client.remoteAddress}:#{@client.remotePort}>"
      @emit 'init'

    @client.on 'data', (data) =>
      switch @state
        when -1
          if 1 is data.readUInt32LE 0
            @state = 0
            @client.write @session.clientKeys[0]
        when 0
          if data.length is 128
            data.copy @session.serverKeys[0]
            @state = 1
            @client.write @session.clientKeys[1]
        when 1
          if data.length is 128
            data.copy @session.serverKeys[1]
            @session.init()
            @state = 2
            @emit 'connect'
        when 2
          @session.encrypt data
          @serverBuffer.write data

          while data = @serverBuffer.read()
            #console.log '<-', _toString data # debug
            opcode = data.readUInt16LE 2
            @dispatch.handle opcode, data
      return

    @client.on 'close', =>
      console.log '<disconnected>'
      @emit 'close'

    @client.on 'error', (err) =>
      console.warn err
      @emit 'error', err

  send: (data) ->
    #console.log '->', _toString data # debug
    if @client? and @state is 2
      @session.decrypt data
      @client.write data
      true
    else
      false

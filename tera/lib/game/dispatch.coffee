protocol = require './protocol'

module.exports = class Dispatch
  constructor: ->
    @connection = null
    @modules = {}
    @hooks =
      raw: {}
      pre: {}

  hook: (name, type, cb) ->
    if !cb?
      cb = type
      type = 'pre'

    if name is '*'
      type = 'raw'
      code = name
    else if typeof name is 'number'
      code = name
    else
      code = protocol.map.name[name]

    hooks = @hooks[type]
    if !hooks?
      console.warn "[dispatch] hook: unexpected hook type '#{type}'"
      hooks = @hooks.pre

    hooks[code] ?= []
    hooks[code].push cb

  toServer: (name, data) ->
    if name.constructor is Buffer
      data = name
    else
      try
        data = protocol.write name, data
      catch e
        console.error '[dispatch] failed to generate message:', name
        console.error e
        console.error data
        return false

    @connection?.send data
    return

  handle: (code, data) ->
    hooks = @hooks.raw['*']
    cb code, data for cb in hooks if hooks?

    hooks = @hooks.raw[code]
    cb code, data for cb in hooks if hooks?

    hooks = @hooks.pre[code]
    if hooks?
      event = protocol.parse code, data
      cb event for cb in hooks

    return

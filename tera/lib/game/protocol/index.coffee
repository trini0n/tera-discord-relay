#
# requires
#
fs = require 'fs'
path = require 'path'

Stream = require './stream'

#
# constants
#
PATH_DEFS = path.join __dirname, '../../../def'
FILE_MAPDEF = '_map.def'

#
# helpers
#
getLength = (message, data) ->
  length = 0

  for [key, type] in message
    if typeof type is 'object'
      # array, so recurse
      for element in data[key]
        length += 4 + getLength type, element
    else
      switch type
        when 'byte'
          length += 1
        when 'bytes'
          length += data[key].length
        when 'int16', 'uint16', 'count', 'offset'
          length += 2
        when 'int32', 'uint32', 'float'
          length += 4
        when 'int64', 'uint64', 'double'
          length += 8
        when 'string'
          length += (data[key].length + 1) * 2
        else
          console.error "unknown type #{type}"
          return

  length

#
# exports
#
module.exports = _module =
  map:
    name: {}
    code: {}

  messages: {}

  load: ->
    _module.map = map =
      name: {}
      code: {}

    _module.messages = messages = {}

    filepath = path.join PATH_DEFS, FILE_MAPDEF
    data = fs.readFileSync filepath, encoding: 'utf8'
    for line, i in data.split /\r?\n/
      line = line.replace /#.*$/, ''
      line = line.trim()
      continue if line is ''

      line = line.match /^(\S+)\s*(\S+)$/
      if !line
        console.error "parse error: malformed line (#{filename}:#{i})"
        return false
      else
        [_, name, code] = line
        code = parseInt code
        if isNaN code
          console.error "parse error: invalid code '#{line[2]}' (#{filename}:#{i})"
          return false

        map.name[name] = code
        map.code[code] = name

    files = fs.readdirSync PATH_DEFS
    for file in files when path.extname(file) is '.def' and file isnt FILE_MAPDEF
      filepath = path.join PATH_DEFS, file
      data = fs.readFileSync filepath, encoding: 'utf8'

      message = []
      order = []
      top = message

      name = path.basename file, '.def'
      for line, i in data.split /\r?\n/
        line = line.replace /#.*$/, ''
        line = line.trim()
        continue if line is ''

        line = line.match /^((?:\s*-)*)?\s*(\S+)\s*(\S+)$/
        if !line
          console.error "parse error: malformed line (#{name}:#{i})"
          return false

        [_, depth, type, key] = line

        depth = depth?.replace(/[^-]/g, '').length ? 0
        if depth > order.length
          if depth isnt order.length + 1
            console.error "parse error: rolling in the deep (#{name}:#{i})"

          id = top.length - 1
          top = top[id][1]
          order.push id
        else
          order.pop() while depth < order.length
          top = message
          top = top[i][1] for i in order

        top.push [key, if type is 'array' then [] else type]

      messages[name] = message
      console.warn "[protocol] unmapped message '#{name}'" if !map.name[name]?

    true

  parse: (message, reader) ->
    data = {}

    switch typeof message
      when 'object'
        ;

      when 'string'
        name = message
        message = _module.messages[name]
        if !message?
          return console.error "unknown message '#{name}'"

      when 'number'
        code = message
        name = _module.map.code[code]
        if !name?
          return console.error "unknown code #{code} (0x#{code.toString 16})"
        message = _module.messages[name]
        if !message?
          return console.error "unknown message '#{name}'"

      else
        return console.error "invalid message type #{typeof message}"

    if reader.constructor is Buffer
      reader = new Stream.Readable reader, 4

    count = {}
    offset = {}
    for [key, type] in message
      if typeof type is 'object'
        array = Array count[key]

        index = 0
        next = offset[key]
        while next
          pos = reader.position
          if pos isnt next
            console.warn "offset mismatch for array '#{key}': expected #{next} (at #{reader.position})"
            reader.seek next
            pos = next

          here = reader.uint16()
          if pos isnt here
            console.error "cannot find next element of array '#{key}' (at #{pos})"
            return

          next = reader.uint16()
          element = _module.parse type, reader
          array[index++] = element

        data[key] = array
      else
        switch type
          when 'count'
            count[key] = reader.uint16()
          when 'offset'
            offset[key] = reader.uint16()
          else
            if offset[key]? and reader.position isnt offset[key]
              console.warn "offset mismatch for '#{key}': expected #{offset[key]} (at #{reader.position})"
              reader.seek offset[key]

            if type is 'bytes'
              data[key] = reader.bytes count[key]
            else
              data[key] = reader[type]()

    data

  write: (message, data, writer) ->
    code = -1
    switch typeof message
      when 'object'
        ;
      when 'string'
        code = _module.map.name[message]
        message = _module.messages[message]

        if !code?
          return console.error "code not known for message '#{message}'"
      when 'number'
        code = message
        message = _module.messages[_module.map.code[message]]
      else
        return console.error "invalid message type #{typeof message}"

    if !writer?
      length = 4 + getLength message, data
      writer = new Stream.Writeable length
      writer.uint16 length
      writer.uint16 code

    count = {}
    offset = {}

    for [key, type] in message
      if typeof type is 'object'
        array = data[key]
        length = array.length
        if length isnt 0
          here = writer.position
          writer.seek count[key]
          writer.uint16 array.length
          writer.seek here
          last = offset[key]

          for element in array
            here = writer.position
            writer.seek last
            writer.uint16 here
            writer.seek here
            writer.uint16 here
            last = writer.position
            writer.uint16 0
            _module.write type, element, writer
      else
        switch type
          when 'count'
            count[key] = writer.position
            writer.uint16 0
          when 'offset'
            offset[key] = writer.position
            writer.uint16 0
          else
            if count[key]?
              here = writer.position
              writer.seek count[key]
              writer.uint16 data[key].length
              writer.seek here

            if offset[key]?
              here = writer.position
              writer.seek offset[key]
              writer.uint16 here
              writer.seek here

            writer[type] data[key]

    writer.buffer

_module.load()

IPC = require './ipc'

REFRESH_THRESHOLD = 60 * 1000
REFRESH_TIMER = 15 * 1000

escape = (str) ->
  str
    .replace /"/g, '&quot;'
    .replace /&/g, '&amp;'
    .replace /</g, '&lt;'
    .replace />/g, '&gt;'
    .replace /\.(?=com)/gi, '.&#8206;' # bypass ".com"
    .replace /w-w/gi, (match) -> match.split('-').join('-&#8206;')   # bypass "w-w"
    .replace /w{3,}/gi, (match) -> match.split('').join('&#8206;')   # bypass "www"
    .replace /w w w/gi, (match) -> match.split(' ').join('&#8206; ') # bypass "w w w"
    .replace /fag/gi, (match) -> match[0] + '&#8206;' + match[1..]   # bypass "fag"
    .replace /molest/gi, (match) -> match[0] + '&#8206;' + match[1..] # bypass "molest"
    .replace /\n/g, ' '
    .replace /\t/g, '    '
    .replace /[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '?'
    .replace /[^\x20-\x7E]/g, '?'

module.exports = class Discord
  constructor: (game, config) ->
    path = config.socketName
    if process.platform is 'win32'
      path = '\\\\.\\pipe\\' + path
    else
      path = "/tmp/#{path}.sock"

    dispatch = game.client.dispatch
    ipc = new IPC.client path, (event, args...) ->
      switch event
        when 'fetch'
          dispatch.toServer 'cRequestRefreshGuildData'
        when 'chat'
          [author, message] = args
          dispatch.toServer 'cChat',
            channel: 2,
            message: '<FONT>' + (escape "<#{author}> #{message}") + '</FONT>'
        when 'info'
          [message] = args
          dispatch.toServer 'cChat',
            channel: 2,
            message: "<FONT>* #{escape message}</FONT>"
        when 'userlist'
          [target, lists] = args
          ###
          for type, list of lists
            list.sort (a, b) -> a.localeCompare b
          list = lists.online.join ', '
          if lists.offline.length > 0
            list += '. Offline: ' + lists.offline.join ', '
          ###
          list = lists.online.concat lists.offline
          list.sort (a, b) -> a.localeCompare b
          list = list.join ', '
          dispatch.toServer 'cWhisper',
            target: target
            message: "<FONT>Discord #gchat users: #{escape list}</FONT>"

    myName = false
    motd = ''
    guildMembers = []
    lastUpdate = null

    setInterval (->
      if lastUpdate and Date.now() - lastUpdate > REFRESH_THRESHOLD
        dispatch.toServer 'cRequestRefreshGuildData'
        lastUpdate = Date.now() # prevent spamming
    ), REFRESH_TIMER

    dispatch.hook 'sLogin', (event) ->
      myName = event.name

    dispatch.hook 'sChat', (event) ->
      if event.channel is 2 and event.authorName isnt myName
        ipc.send 'chat', event.authorName, event.message
        return

    dispatch.hook 'sSystemMessage', (event) ->
      args = event.message.split '\x0B'
      str = args.shift()
      params = {}
      while args.length > 0
        params[args.shift()] = args.shift()

      switch str
        when '@1769', '@1770' # guild login
          ipc.send 'userlist', params['UserName']
          dispatch.toServer 'cRequestRefreshGuildData'
        when '@260', '@263', '@760', '@761', '@1954' # guild sysmsg
          dispatch.toServer 'cRequestRefreshGuildData'

      ipc.send 'sysmsg', str, params
      return

    dispatch.hook 'sGuildInfo', (event) ->
      {motd} = event
      lastUpdate = Date.now()
      return

    dispatch.hook 'sGuildMemberList', (event) ->
      if event.first
        guildMembers = []

      for member in event.members
        if member.status isnt 2 and member.name isnt myName
            guildMembers.push member.name

      if event.last
        ipc.send 'guild', motd, guildMembers

      return

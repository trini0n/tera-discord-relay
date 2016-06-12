Sysmsg = require 'sysmsg'
TeraStrings = require 'tera-strings'
IPC = require './ipc'

REFRESH_THRESHOLD = 60 * 1000
REFRESH_TIMER = 15 * 1000

conv = (s) ->
  TeraStrings(s) || '(???)'

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
    sysmsg = new Sysmsg dispatch
    ipc = new IPC.client path, (event, args...) ->
      switch event
        when 'fetch'
          dispatch.toServer 'cRequestGuildMemberList'
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

    myName = false
    motd = ''
    allGuildies = []
    guildMembers = []
    lastUpdate = null

    setInterval (->
      if lastUpdate and Date.now() - lastUpdate > REFRESH_THRESHOLD
        dispatch.toServer 'cRequestGuildMemberList'
        lastUpdate = Date.now() # prevent spamming
    ), REFRESH_TIMER

    dispatch.hook 'sLogin', (event) ->
      myName = event.name

    dispatch.hook 'sChat', (event) ->
      if event.channel is 2 and event.authorName isnt myName
        ipc.send 'chat', event.authorName, event.message
        return

    #################
    # Guild Notices #
    #################
    sysmsg.on 'SMT_GC_MSGBOX_APPLYLIST_1', (params) ->
      ipc.send 'sysmsg', "#{params['Name']} joined the guild."
      dispatch.toServer 'cRequestGuildMemberList'

    sysmsg.on 'SMT_GC_MSGBOX_APPLYRESULT_1', (params) ->
      ipc.send 'sysmsg', "#{params['Name1']} accepted #{params['Name2']} into the guild."
      dispatch.toServer 'cRequestGuildMemberList'

    sysmsg.on 'SMT_GUILD_LOG_LEAVE', (params) ->
      ipc.send 'sysmsg', "#{params['UserName']} left the guild."
      dispatch.toServer 'cRequestGuildMemberList'

    sysmsg.on 'SMT_GUILD_LOG_BAN', (params) ->
      ipc.send 'sysmsg', "#{params['UserName']} was kicked out of the guild."
      dispatch.toServer 'cRequestGuildMemberList'

    sysmsg.on 'SMT_GUILD_MEMBER_LOGON', (params) ->
      ipc.send 'sysmsg', "#{params['UserName']} logged in. Message: #{params['Comment']}"
      dispatch.toServer 'cRequestGuildMemberList'

    sysmsg.on 'SMT_GUILD_MEMBER_LOGON_NO_MESSAGE', (params) ->
      ipc.send 'sysmsg', "#{params['UserName']} logged in."
      dispatch.toServer 'cRequestGuildMemberList'

    sysmsg.on 'SMT_GUILD_MEMBER_LOGOUT', (params) ->
      ipc.send 'sysmsg', "#{params['UserName']} logged out."
      dispatch.toServer 'cRequestGuildMemberList'

    sysmsg.on 'SMT_GC_SYSMSG_GUILD_CHIEF_CHANGED', (params) ->
      ipc.send 'sysmsg', "#{params['Name']} is now the Guild Master."

    sysmsg.on 'SMT_ACCOMPLISH_ACHIEVEMENT_GRADE_GUILD', (params) ->
      ipc.send 'sysmsg', "#{params['name']} earned a #{conv params['grade']}."

    ################
    # Misc Notices #
    ################
    sysmsg.on 'SMT_MAX_ENCHANT_SUCCEED', (params) ->
      if params['UserName'] in allGuildies
        message = "#{params['UserName']} has successfully enchanted"
        message += " (+#{params['Added']}) <#{conv params['ItemName']}>."
        ipc.send 'sysmsg', message

    sysmsg.on 'SMT_GACHA_REWARD', (params) ->
      if params['UserName'] in allGuildies
        message = "#{params['UserName']} obtained <#{conv params['randomItemName']}> x"
        message += " #{params['randomItemCount']} from <#{conv params['gachaItemName']}>."
        ipc.send 'sysmsg', message

    ###############
    # guild hooks #
    ###############
    dispatch.hook 'sGuildInfo', (event) ->
      {motd} = event
      lastUpdate = Date.now()
      return

    dispatch.hook 'sGuildMemberList', (event) ->
      if event.first
        allGuildies = []
        guildMembers = []

      for member in event.members
        allGuildies.push member.name
        if member.status isnt 2 and member.name isnt myName
            guildMembers.push member.name

      if event.last
        ipc.send 'guild', motd, guildMembers

      return

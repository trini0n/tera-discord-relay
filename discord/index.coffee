Discord = require 'discord.js'
IPC = require './ipc'

config = require './config.json'

bot = new Discord.Client
server = null
channel = null
entry = null
guildRole = null
userlist = {}

escapeRegExp = (s) -> s.replace /[-/\\^$*+?.()|[\]{}]/g, '\\$&'

unHtml = (s) ->
  s
    .replace /<.*?>/g, ''
    .replace /&quot;/gi, '"'
    .replace /&amp;/gi, '&'
    .replace /&lt;/gi, '<'
    .replace /&gt;/gi, '>'

path = config['socket-name']
if process.platform is 'win32'
  path = '\\\\.\\pipe\\' + path
else
  path = "/tmp/#{path}.sock"

ipc = new IPC.client path, (event, args...) ->
  if channel?
    switch event
      when 'chat'
        [author, message] = args

        # convert HTML to text
        message = unHtml message

        # convert @mention
        for user in server.members
          regexp = new RegExp (escapeRegExp '@' + user.username), 'gi'
          message = message.replace regexp, user.mention()

        # convert #channel
        for ch in server.channels when ch.type is 'text'
          regexp = new RegExp (escapeRegExp '#' + ch.name), 'gi'
          message = message.replace regexp, ch.mention()

        # send
        bot.sendMessage channel, "[#{author}]: #{message}"

      when 'guild'
        [names] = args
        names.sort (a, b) -> a.localeCompare b
        bot.setTopic channel, 'Online: ' + names.join ', '

      when 'userlist'
        [target] = args
        lists =
          online: []
          offline: []
        for id, online of userlist
          user = server.members.get 'id', id
          lists[if online then 'online' else 'offline'].push user?.username ? '(#' + id + ')'
        ipc.send 'userlist', target, lists

      when 'sysmsg'
        [str, params] = args
        switch str
          # guild invite
          when '@260'
            user = params['Name']
            bot.sendMessage channel, "#{user} joined the guild."

          # guild app accept
          when '@263'
            # send to channel
            from = params['Name1']
            user = params['Name2']
            bot.sendMessage channel, "#{from} accepted #{user} into the guild."

          # guild quit
          when '@760'
            user = params['UserName']
            bot.sendMessage channel, "#{user} left the guild."

          # guild kick
          when '@761'
            user = params['UserName']
            bot.sendMessage channel, "#{user} was kicked out of the guild."

          # guild login
          when '@1769', '@1770'
            user = params['UserName']
            comment = params['Comment']
            str = "#{user} logged in."
            str += " Message: #{unHtml comment}" if comment
            bot.sendMessage channel, str

          # guild logout
          when '@1954'
            user = params['UserName']
            bot.sendMessage channel, "#{user} logged out."

bot.on 'ready', ->
  console.log 'connected as %s (%s)', bot.user.username, bot.user.id

  server = bot.servers.get 'id', config['server-id']
  if !server?
    console.error 'server "%s" not found', config['server-id']
    console.error 'servers:'
    for s in bot.servers
      console.error '- %s (%s)', s.name, s.id
    bog.logout()
    return

  channel = server.channels.get 'name', config['gchat-channel']
  if !channel?
    console.error 'gchat channel "%s" not found', config['gchat-channel']
    bot.logout()
    return

  entry = server.channels.get 'name', config['entry-channel']
  if !entry?
    console.warn 'entry channel "%s" not found', config['entry-channel']

  botRoles = server.rolesOfUser bot.user
  # guild role is the first role that the bot does not have with explicit read to the channel
  for overwrite in channel.permissionOverwrites when overwrite.type is 'role'
    if 'readMessages' in overwrite.allowed
      if not (botRoles.some (role) -> role.id is overwrite.id)
        r = server.roles.get 'id', overwrite.id
        console.log 'using guild role %s (%s)', r.name, r.id
        guildRole = r.id

  if !guildRole?
    console.log 'guild role not found'
    bot.logout()
    return

  console.log 'fetching users...'
  for user in server.members
    roles = server.rolesOfUser user
    if (roles.some (role) -> role.id is guildRole)
      userlist[user.id] = (user.status isnt 'offline')

  for overwrite in channel.permissionOverwrites when overwrite.type is 'member'
    if 'readMessages' in overwrite.denied
      delete userlist[overwrite.id]

  bot.setStatus 'online', 258
  console.log 'routing to #%s (%s)', channel.name, channel.id

  ipc.send 'fetch'

bot.on 'presence', (user, status, game) ->
  oldStatus = userlist[user.id]
  if oldStatus?
    online = (status isnt 'offline')
    if oldStatus isnt online
      userlist[user.id] = online
      # too spammy?
      ;#ipc.send 'info', "@#{user.username} is now #{if online then 'on' else 'off'}line"

bot.on 'message', (message) ->
  if message.channel.equals channel
    if not message.author.equals bot.user
      str = message.content
        .replace /<@(\d+)>/g, (_, mention) ->
          m = server.members.get 'id', mention
          '@' + (m?.username ? '(???)')
        .replace /<#(\d+)>/g, (_, mention) ->
          m = server.channels.get 'id', mention
          '#' + (m?.name ? '(???)')
      ipc.send 'chat', message.author.username, str

bot.on 'serverNewMember', (eventServer, user) ->
  if entry? and eventServer.equals server
    bot.sendMessage entry, "@everyone please give #{user} a warm welcome!"

bot.on 'serverMemberUpdated', (eventServer, user) ->
  if eventServer.equals server
    roles = server.rolesOfUser user
    if (roles.some (role) -> role.id is guildRole)
      if !userlist[user.id]?
        online = (user.status isnt 'offline')
        userlist[user.id] = online
        if online
          ipc.send 'info', "@#{user.username} joined ##{channel.name}"

bot.on 'userUpdate', (oldUser, newUser) -> # TODO this was fixed in discord.js c9497a0
  oldStatus = userlist[oldUser.id]
  if oldStatus?
    if oldUser.username isnt newUser.username
      ipc.send 'info', "@#{oldUser.username} changed name to @#{newUser.username}"
    else
      online = (newUser.status isnt 'offline')
      if oldStatus isnt online
        userlist[oldUser.id] = online
        # too spammy?
        ;#ipc.send 'info', "@#{newUser.username} is now #{if online then 'on' else 'off'}line"

bot.on 'disconnected', ->
  console.log 'disconnected'
  channel = null

bot.on 'warn', (warn) ->
  console.warn warn

console.log 'connecting...'
bot.login config['email'], config['password']

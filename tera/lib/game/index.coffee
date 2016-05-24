#
# includes
#
events = require 'events'

Dispatch = require './dispatch'
Connection = require './connection'

#
# helpers
#
describe = do ->
  races = ['Human', 'High Elf', 'Aman', 'Castanic', 'Popori', 'Baraka']
  genders = ['Male', 'Female']
  classes = ['Warrior', 'Lancer', 'Slayer', 'Berserker', 'Sorcerer', 'Archer', 'Priest', 'Mystic', 'Reaper', 'Gunner', 'Brawler', 'Ninja']

  (character) ->
    description = ''

    # Race & Gender
    race = races[character.race] ? '?'
    gender = genders[character.gender] ? '?'

    if character.race < 4
      description += "#{race} #{gender}"
    else
      if character.race is 4 and character.gender is 1
        description += 'Elin'
      else
        description += race

    # Class
    description += " #{classes[character.class] ? '?'} / "

    # Level
    description += character.level

    # Return
    description

#
# exports
#
module.exports = class GameClient
  constructor: (name, ticket, desiredCharacter) ->
    dispatch = new Dispatch
    @client = new Connection dispatch

    # `connect` handler
    @client.on 'connect', ->
      # version check
      dispatch.toServer 'cCheckVersion', version: [
        { index: 0, value: 0x00049D47 }
        { index: 1, value: 0x0004990A }
      ]

      # authorization
      dispatch.toServer 'cLoginArbiter',
        unk1: 0 # ?
        unk2: 0 # ?
        unk3: 2 # ?
        unk4: 4206 # patch version
        name: name
        ticket: new Buffer ticket

    # character list
    dispatch.hook 'sLoginAccountInfo', ->
      dispatch.toServer 'cGetUserList'

    dispatch.hook 'sGetUserList', (event) ->
      # parse character list
      characters = {}
      for character in event.characters
        characters[character.name.toLowerCase()] =
          id: character.id
          description: "#{character.name} [#{describe character}]"

      # find matching character
      character = characters[desiredCharacter.toLowerCase()]
      if !character?
        console.error "[client] no character '#{desiredCharacter}'"
        console.error "[client] character list:"
        for _, character of characters
          console.error "- #{character.description} (id:#{character.id})"
      else
        console.log "[client] logging onto #{character.description} (id:#{character.id})"
        dispatch.toServer 'cSelectUser',
          id: character.id
          unk: 0

      return

    # login sequence
    dispatch.hook 'sLoadTopo', ->
      dispatch.toServer 'cLoadTopoFin'
      return

    # ping-pong
    dispatch.hook 'sPing', ->
      dispatch.toServer 'cPong'
      return

    # terminate when connection ends
    @client.on 'close', ->
      process.exit()

  connect: ->
    # pass through for now
    @client.connect.apply @client, arguments

  send: ->
    # pass through for now
    @client.send.apply @client, arguments

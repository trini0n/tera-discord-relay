fs = require 'fs'
fn = process.argv[2]

if !fn?
  console.error 'please specify config file'
  process.exit 1

config = JSON.parse fs.readFileSync fn, 'utf8'

webClient = require './lib/web'
gameClient = require './lib/game'

web = new webClient config.email, config.pass
web.getLogin (err, data) ->
	return if err
	{name, ticket} = data

	game = new gameClient name, ticket, config.character
	game.connect host: config.host, port: config.port

	for moduleName, moduleConfig of config.modules
		module = require './app/' + moduleName
		module = new module game, moduleConfig
		console.log 'loaded module ' + moduleName

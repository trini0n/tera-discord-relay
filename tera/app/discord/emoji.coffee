emoji = require './lib/js-emoji.min'
emoji.colons_mode = true
emoji.text_mode = true

shortcuts =
  broken_heart: '</3'
  confused: ':-/'
  frowning: ':('
  heart: '<3'
  hearts: '<3'
  neutral_face: ':|'
  open_mouth: ':o'
  smile: ':D'
  smiley: ':)',
  stuck_out_tongue: ':P'
  sunglasses: '8)'
  unamused: ':s'
  wink: ';)'
regex = new RegExp ':(' + (Object.keys(shortcuts).join '|') + '):', 'gi'

module.exports = (s) -> emoji.replace_unified(s).replace regex, (_, $1) -> shortcuts[$1.toLowerCase()]

# includes (modules)
request = require 'request'

# helper functions
des = require './des'

base64 =
  encode: (str) -> new Buffer(str).toString('base64')
  decode: (str) -> new Buffer(str, 'base64').toString()

pad = (n) -> "0000#{n.toString 16}".slice -4

# set defaults
request = request.defaults
  headers:
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    'Accept-Language': 'en-us,en'
    'Accept-Charset': 'iso-8859-1,*,utf-8'
    'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/535.21 (KHTML, like Gecko) Chrome/19.0.1046.0 Safari/535.21'
  jar: true
  timeout: 20 * 1000

# main (exported)
module.exports = (callback) ->
  request 'https://mpsnare.iesnare.com/snare.js', (err, res, body) ->
    if err
      console.error err
      return callback 'error retrieving snare.js'

    # retrieve vals
    FLRTD = body.match(/"FLRTD","(.+?)"/i)[1]
    IGGY = body.match(/"IGGY","(.+?)"/i)[1]
    JSSRC = base64.decode body.match(/"JSSRC",_i_[a-z]+\.__if_[a-z]+\("(.+?)"\)/i)[1]
    SVRTIME = body.match(/"SVRTIME","(.+?)"/i)[1]

    # generate time
    d = new Date()
    ymd = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()].join '/'
    hms = [d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()].join ':'
    JSTIME = "#{ymd} #{hms}"

    # serialize
    params =
      CTOKEN   : FLRTD
      HACCCHR  : 'iso-8859-1,*,utf-8'
      HACCLNG  : 'en-us,en'
      IGGY     : IGGY
      INTLOC   : 'https://account.enmasse.com/'
      JBRCM    : 'WOW64; KHTML, like Gecko'
      JBRNM    : 'Chrome'
      JBROS    : 'Windows NT 6.1'
      JBRVR    : '19.0.1046.0'
      JENBL    : '1'
      JLANG    : 'en-US'
      JRES     : '768x1366'
      JSSRC    : JSSRC
      JSTIME   : JSTIME
      JSTOKEN  : FLRTD
      JSVER    : '311'
      LSTOKEN  : FLRTD
      SVRTIME  : SVRTIME
      TZON     : '0'
      UAGT     : 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/535.21 (KHTML, like Gecko) Chrome/19.0.1046.0 Safari/535.21'
      WDBTOKEN : FLRTD

    serialized = pad Object.keys(params).length, 4
    for key, value of params
      serialized += pad key.length
      serialized += key.toUpperCase()
      serialized += pad value.length
      serialized += value

    key = String.fromCharCode 0x7c, 0x4c, 0x45, 0x00, 0x63, 0x02, 0xc8, 0xa3
    data = '0400' + base64.encode des.encrypt key, serialized

    # get url of next
    next = base64.decode body.match(/"src",_i_[a-z]+\.__if_[a-z]+\("(.+?)"\)/i)[1]
    request next, (e, res, body) ->
      if e
        console.warn '[snare.js] failed to retrieve: ' + next

      callback null, data

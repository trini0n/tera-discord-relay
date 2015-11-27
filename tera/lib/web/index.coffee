request = require 'request'
snare = require './snare'

module.exports = class webClient
  constructor: (@email, @pass) ->
    @ready = -1
    @request = request.defaults
      headers:
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        'Accept-Language': 'en-us,en'
        'Accept-Charset': 'iso-8859-1,*,utf-8'
        'Host': 'account.enmasse.com'
        'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/535.21 (KHTML, like Gecko) Chrome/19.0.1046.0 Safari/535.21'
      jar: true
      strictSSL: false
      timeout: 20 * 1000

  getLogin: (callback) ->
    @_signin =>
      if @ready is 1
        @request 'https://account.enmasse.com/launcher/1', (err, res, body) =>
          token = body.match(/meta content="(.+?)" name="csrf-token"/i)[1]
          if !token
            console.error 'failed to get CSRF token'
            return

          @request
            url: 'https://account.enmasse.com/launcher/1/account_server_info?attach_auth_ticket=1'
            headers:
              # defaults
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
              'Accept-Language': 'en-us,en'
              'Accept-Charset': 'iso-8859-1,*,utf-8'
              'Host': 'account.enmasse.com'
              'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/535.21 (KHTML, like Gecko) Chrome/19.0.1046.0 Safari/535.21'
              # CSRF
              'Referer': 'https://account.enmasse.com/launcher/1'
              'X-CSRF-Token': token
              'X-Requested-With': 'XMLHttpRequest'
          , (err, res, body) =>
            if err
              console.error err
              return callback 'failed to get info'

            if res.statusCode isnt 200
              console.error 'statusCode != 200'
              return callback 'statusCode != 200'

            try
              data = JSON.parse body
            catch e
              console.error body
              console.error e
              return callback 'JSON parse error'

            if data['result-code'] isnt 200
              console.error 'result-code != 200'
              return callback 'result-code != 200'

            console.log "[web] got ticket (#{data.master_account_name}:#{data.ticket})"

            callback null, name: data.master_account_name, ticket: data.ticket

  # ########
  # signin()
  # ########
  # Pulls CSRF token and gets snare.js blackbox result.
  _signin: (callback) ->
    if @ready is 1
      callback()
      return true
    else if @ready is 0
      return
    else
      @ready = 0

    console.log '[web] (login) getting CSRF token'

    @request 'https://account.enmasse.com/', (err, res, body) =>
      if err
        console.error err
        return

      token = body.match(/meta content="(.+?)" name="csrf-token"/i)[1]
      if !token
        console.error 'failed to get CSRF token'
        return

      console.log '[web] (login) getting blackbox'

      snare (err, blackbox) =>
        return if err
        @_authenticate callback,
          'utf8': '✓'
          'authenticity_token': token
          'user[client_time]': ''
          'user[io_black_box]': blackbox
          'user[email]': @email
          'user[password]': @pass

  # ##############
  # authenticate #
  # ##############
  # Submits login form and follows the redirect.
  _authenticate: (callback, params) ->
    console.log '[web] (login) authenticating'

    @request.post
      url: 'https://account.enmasse.com/authenticate'
      headers:
        # defaults (TODO find better way to copy this)
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        'Accept-Language': 'en-us,en'
        'Accept-Charset': 'iso-8859-1,*,utf-8'
        'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/535.21 (KHTML, like Gecko) Chrome/19.0.1046.0 Safari/535.21'
        # set host, origin, & referer
        'Host': 'account.enmasse.com'
        'Origin': 'https://account.enmasse.com'
        'Referer': 'https://account.enmasse.com/'
      form: params
    , (err, res, body) =>
      if err
        console.error err
        return

      if res.statusCode isnt 302
        console.error 'failed to auth'
        return

      # request won't auto-follow if we didn't use GET
      @request res.headers.location, =>
        @ready = 1
        callback()

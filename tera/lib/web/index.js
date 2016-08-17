'use strict';

const request = require('request');
const snare = require('./snare');

function makeHeaders(o) {
  return Object.assign({},
    {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-us,en',
      'Accept-Charset': 'iso-8859-1,*,utf-8',
      'Host': 'account.enmasse.com',
      'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/535.21 (KHTML, like Gecko) Chrome/19.0.1046.0 Safari/535.21',
    },
    o
  );
}

class webClient {
  constructor(email, pass) {
    this.email = email;
    this.pass = pass;
    this.ready = -1;
    this.request = request.defaults({
      baseUrl: 'https://account.enmasse.com',
      headers: makeHeaders(),
      jar: true,
      strictSSL: false,
      timeout: 20 * 1000,
    });
  }

  getLogin(callback) {
    return this._signin(() => {
      if (this.ready !== 1) return;

      this.request('/launcher/1', (err, res, body) => {
        const token = body.match(/meta content="(.+?)" name="csrf-token"/i);
        if (!token) {
          console.error('failed to get CSRF token');
          return;
        }

        this.request({
          url: '/launcher/1/account_server_info?attach_auth_ticket=1',
          headers: makeHeaders({
            'Referer': 'https://account.enmasse.com/launcher/1',
            'X-CSRF-Token': token[1],
            'X-Requested-With': 'XMLHttpRequest',
          }),
        }, (err, res, body) => {
          if (err) {
            console.error(err);
            return callback('failed to get info');
          }

          if (res.statusCode !== 200) {
            console.error('statusCode != 200');
            return callback('statusCode != 200');
          }

          let data;
          try {
            data = JSON.parse(body);
          } catch (e) {
            console.error(body);
            console.error(e);
            return callback('JSON parse error');
          }

          if (data['result-code'] !== 200) {
            console.error('result-code != 200');
            return callback('result-code != 200');
          }

          console.log(`[web] got ticket (${data.master_account_name}:${data.ticket})`);

          callback(null, {
            name: data.master_account_name,
            ticket: data.ticket,
          });
        });
      });
    });
  }

  /* ********
   * signin()
   * ********
   * Pulls CSRF token and gets snare.js blackbox result.
   */
  _signin(callback) {
    if (this.ready === 1) {
      callback();
      return true;
    } else if (this.ready === 0) {
      return;
    } else {
      this.ready = 0;
    }

    console.log('[web] (login) getting CSRF token');

    this.request('/', (err, res, body) => {
      if (err) {
        console.error(err);
        return;
      }

      const token = body.match(/meta content="(.+?)" name="csrf-token"/i);
      if (!token) {
        console.error('failed to get CSRF token');
        return;
      }

      console.log('[web] (login) getting blackbox');

      snare((err, blackbox) => {
        if (err) return;
        this._authenticate(callback, {
          'utf8': '✓',
          'authenticity_token': token[1],
          'user[client_time]': '',
          'user[io_black_box]': blackbox,
          'user[email]': this.email,
          'user[password]': this.pass,
        });
      });
    });
  };

  /* **************
   * authenticate()
   * **************
   * Submits login form and follows the redirect.
   */
  _authenticate(callback, params) {
    console.log('[web] (login) authenticating');

    this.request.post({
      url: '/authenticate',
      headers: makeHeaders({
        'Host': 'account.enmasse.com',
        'Origin': 'https://account.enmasse.com',
        'Referer': 'https://account.enmasse.com/',
      }),
      form: params,
    }, (err, res, body) => {
      if (err) {
        console.error(err);
        return;
      }

      if (res.statusCode !== 302) {
        console.error('failed to auth');
        return;
      }

      // request won't auto-follow if we didn't use GET
      this.request(res.headers.location, () => {
        this.ready = 1;
        callback();
      });
    });
  };
}

module.exports = webClient;

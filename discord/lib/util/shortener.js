const fs = require('fs');
const http = require('http');
const path = require('path');

class LocalShortener {
  constructor(opts) {
    this.port = opts.port;
    this.host = opts.host;
    this.dbPath = path.resolve(opts.db);

    try {
      this.db = require(this.dbPath);
    } catch (err) {
      if (err.code !== 'MODULE_NOT_FOUND') throw err;
      this.db = { id: 1, urls: {} };
    }

    this.server = http.createServer((req, res) => {
      if (req.method !== 'GET') {
        res.statusCode = 501;
        res.end();
        return;
      }

      const match = req.url.match(/^\/(\d+)(?:\/.*)?$/);
      if (match) {
        const redir = this.db.urls[match[1]];
        if (redir) {
          res.writeHead(301, { 'Location': redir });
          res.end();
          return;
        }
      }

      res.statusCode = 404;
      res.end();
    }).listen(this.port);
  }

  shorten(url) {
    let id = this.db.id || 0;
    while (this.db.urls[id]) id++;

    this.db.id = id + 1;
    this.db.urls[id] = url;
    const ret = this.host + '/' + id;

    // TODO async
    fs.writeFileSync(this.dbPath, JSON.stringify(this.db));

    return ret;
  }
}

class NoShortener {
  shorten(url) {
    return url;
  }
}

module.exports = {
  LocalShortener,
  NoShortener,
};

const assert = require('assert');
const superagent = require('superagent-bluebird-promise');
// const util = require('util');

class SyncGateway {
  constructor(opts) {
    const options = opts || {};
    assert.ok(options.host);
    this.host = options.host;
    assert.ok(options.database);
    this.database = options.database;
    this.isSecure = options.isSecure;
    this.port = options.port || 80;
    // assert.ok(options.sessionId || typeof options.credentials === 'object');
  }

  makeUrl(path) {
    const protocol = this.isSecure ? 'https' : 'http';
    const portSuffix = this.port === 80 ? '' : `:${this.port}`;
    const url = `${protocol}://${this.host}${portSuffix}${path}`;
    console.log(`url ${url}`);
    return url;
  }
  execute(cmd) {
    assert.ok(cmd);
    assert.ok(typeof cmd.method === 'string');
    const method = cmd.method.toUpperCase();
    assert.ok(typeof cmd.path === 'string');
    if (!method || method === 'GET') {
      const url = this.makeUrl(cmd.path);
      const request = superagent.get(url)
        .set('content-type', 'application/json');
      if (cmd.query) {
        request.query(cmd.query);
      }
      return request;
    }
    return null;
  }
  serverInfo() {
    return this.execute({
      method: 'GET',
      path: '/',
    });
  }
}

exports.SyncGateway = SyncGateway;

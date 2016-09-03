/* eslint-disable no-underscore-dangle */

const assert = require('assert');
// const superagent = require('superagent-bluebird-promise');
const superagent = require('superagent');
// const util = require('util');
global.Promise = require('bluebird').Promise;


class SyncGateway {
  constructor(opts) {
    const options = opts || {};
    assert.ok(options.host);
    this.host = options.host;
    assert.ok(options.database);
    this.database = options.database;
    this.credentials = options.credentials;
    this.isSecure = options.isSecure;
    this.port = options.port || 80;
    // assert.ok(options.sessionId || typeof options.credentials === 'object');
  }

  makeUrl(path) {
    const protocol = this.isSecure ? 'https' : 'http';
    const portSuffix = this.port === 80 ? '' : `:${this.port}`;
    return `${protocol}://${this.host}${portSuffix}${path}`;
  }
  execute(cmd) {
    assert.ok(cmd);
    assert.ok(typeof cmd.method === 'string');
    const method = cmd.method.toLowerCase();
    assert.ok(typeof cmd.path === 'string');
    const url = this.makeUrl(cmd.path);
    if (['post', 'put', 'delete', 'get'].indexOf(method) === -1) {
      return Promise.reject(new Error(`unsupported method: ${method}`));
    }
    const request = superagent[method](url)
    .set('content-type', 'application/json');
    if (cmd.query) {
      request.query(cmd.query);
    }
    if (this.sessionCookie) {
      request.set('Cookie', `SyncGatewaySession=${this.sessionCookie.SyncGatewaySession}`);
    }
    if (cmd.credentials) {
      const credentials = cmd.credentials;
      assert.ok(typeof credentials === 'object');
      assert.ok(typeof credentials.name === 'string');
      assert.ok(typeof credentials.password === 'string');
      request.auth(credentials.name, credentials.password);
    }
    if (cmd.body) {
      request.send(cmd.body);
    }
    return request;
  }
  serverInfo() {
    return this.execute({
      method: 'GET',
      path: '/',
    });
  }
  session(name, password) {
    assert.ok(name);
    assert.ok(typeof password === 'string');
    this.sessionCookie = null;
    return this.execute({
      method: 'POST',
      path: `/${this.database}/_session`,
      body: { name, password },
    }).then(response => {
      if (response.statusType !== 2) {
        const error = new Error('foo');
        error.response = response;
        throw error;
      }
      const cookieHeaders = response.headers['set-cookie'];
      if (cookieHeaders) {
        const sessionCookies = cookieHeaders
          .map(headerValue => headerValue.split(/; /).reduce((obj, part) => {
            const [partName, partValue] = part.split(/=/);
            return Object.assign(obj, { [partName]: partValue });
          }, {}))
          .filter(cookie => cookie.SyncGatewaySession);
        if (sessionCookies.length > 0) {
          this.sessionCookie = sessionCookies[0];
          return this.sessionCookie;
        }
        const error = Error('Failed to create a new session');
        throw error.response = response;
      }
      return response.body;
    });
  }
  getDatabase() {
    return this.execute({
      method: 'GET',
      path: `/${this.database}`,
    })
    .then(response => response.body);
  }
  /**
   * Create the named database
   * @param name
   * @returns {Bluebird.Promise|Request|Promise.<boolean>|*}
   */
  createDatabase(name) {
    assert.ok(name);
    return this.execute({
      method: 'put',
      path: `/${name}/`,
    })
    .then(response => {
      console.log('Result of creating database', response);
      return response.status === 201;
    });
    // .catch(response => {
    //   console.log('Error of creating database', response);
    // });
  }
  createOrUpdate(_id, document, opts) {
    assert.ok(_id);
    assert.ok(typeof document === 'object');
    const options = opts || {};

    const params = { };
    if (options.rev) params.rev = options.rev;
    if (options.expiry instanceof Date) params.exp = options.expiry.toISOString();
    else if (options.ttl) params.exp = options.ttl;

    return this.execute({
      method: 'put',
      path: `/${this.database}/${_id}`,
      body: document,
      query: params,
    })
    .then(response => response.body);
  }
  create(document, opts) {
    assert.ok(typeof document === 'object');
    const options = opts || {};

    const params = { };
    if (options.expiry instanceof Date) params.exp = options.expiry.toISOString();
    else if (options.ttl) params.exp = options.ttl;

    return this.execute({
      method: 'post',
      path: `/${this.database}/`,
      body: document,
      query: params,
    })
    .then(response => response.body);
  }
  get(id, opts) {
    assert.ok(id);
    const options = opts || {};
    const params = { };
    if (options.attachments) params.attachments = options.attachments;
    if (options.atts_since) params.atts_since = options.atts_since;
    if (options.open_revs) params.open_revs = options.open_revs;
    if (options.revs) params.revs = options.revs;

    return this.execute({
      method: 'get',
      path: `/${this.database}/${id}`,
      query: params,
    })
    .then(response => response.body);
  }
}

exports.SyncGateway = SyncGateway;

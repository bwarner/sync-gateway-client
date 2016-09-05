/* eslint-disable no-underscore-dangle */

const assert = require('assert');
const Transform = require('stream').Transform;
//const inherits = require("util").inherits;
// const superagent = require('superagent-bluebird-promise');
const superagent = require('superagent');
// const util = require('util');
global.Promise = require('bluebird').Promise;

function bodyOnSuccess(callback) {
  assert.ok(typeof callback === 'function');
  return (error, response) => {
    if (response.statusType === 2) {
      callback(error, response.body);
    } else {
      callback(error, response);
    }
  };
}

function pick(object, names) {
  const listOfNames = typeof names === 'string' ? [names] : names;

  return names.reduce((result, name) => {
    if (name in listOfNames) {
      result[name] = listOfNames[name];
    }
    return result;
  }, {});
}

class MultipartStream extends Transform {
  constructor(response, options) {
    super(options);
    this.response = response;
    this.boundary = response.boundary;
    this.text = '';
    this.state = 0;
    this.offset = 0;
    this.headers = {};
  }
  _transform(chunk, encoding, done) {
    const [START, BEGIN_MULTIPART_HEADER, BEGIN_DOC, READING_DOC, END_DOC] = [0, 1, 2, 3, 4];
    this.text += chunk.toString();
    console.log(`chunk:\n${this.text}`);
    let loc = 0;
    switch(this.state) {
      case START:
        const eolIndex = this.text.indexOf('\r\n') + 2;
        if (eolIndex >= 0) {
          this.boundary = this.text.substr(2, eolIndex);
          state = BEGIN_MULTIPART_HEADER;
          this.text = this.text.substring(eolIndex);
        }
        break;
      case BEGIN_MULTIPART_HEADER:
        this.headers = {};
        eolIndex = this.text.indexOf('\r\n');
        if (eolIndex == 0) {
          this.state = BEGIN_DOC;
          this.text = '';
          this.offset = 0;
        } else if (eolIndex > 0) {
          const [name, value] = this.text.substr(this.offset, eolIndex).split(/: */);
          this.header[name] = value;
        }
        break;
        if (loc = this.text.substr(this.boundary, this.offset) >= 0) {
          this.offset = this.offset + this.boundary.length();
          this.state = BEGIN_DOC;
          // done();
        }
        break;
      }
    done();
  }
}

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
  execute(cmd, callback) {
    assert.ok(cmd);
    assert.ok(typeof cmd.method === 'string');
    const method = cmd.method.toLowerCase();
    assert.ok(typeof cmd.path === 'string');
    const url = this.makeUrl(cmd.path);

    const request = superagent[method](url)
    .set('content-type', 'application/json');
    if (['post', 'put', 'delete', 'get'].indexOf(method) === -1) {
      if (callback) callback(new Error(`unsupported method: ${method}`));
      return request;
    }
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
    if (cmd.Transform) {
      request.pipe(new cmd.Transform(request));
    } else {
      request.end(callback);
    }
    return request;
  }
  serverInfo(callback) {
    return this.execute({
      method: 'GET',
      path: '/',
    }, bodyOnSuccess(callback));
  }
  session(name, password, callback) {
    assert.ok(name);
    assert.ok(typeof password === 'string');
    this.sessionCookie = null;
    function _callback(err, response) {
      if (err) {
        callback(err);
        return;
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
          if (callback) callback(null, this.sessionCookie);
          return;
        }
        const error = Error('Failed to create a new session');
        error.response = response;
        if (callback) callback(error);
      }
    }

    return this.execute({
      method: 'POST',
      path: `/${this.database}/_session`,
      body: { name, password },
    }, _callback.bind(this));
  }
  getDatabase(callback) {
    return this.execute({
      method: 'GET',
      path: `/${this.database}`,
    }, bodyOnSuccess(callback));
  }
  /**
   * Create the named database
   * @param name
   * @returns {Bluebird.Promise|Request|Promise.<boolean>|*}
   */
  createDatabase(name, callback) {
    assert.ok(name);
    return this.execute({
      method: 'put',
      path: `/${name}/`,
    }, bodyOnSuccess(callback));
  }
  createOrUpdate(_id, document, opts, callback) {
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
    }, bodyOnSuccess(callback));
  }
  create(document, opts, callback) {
    assert.ok(typeof document === 'object');
    const options = opts || {};

    return this.execute({
      method: 'post',
      path: `/${this.database}/`,
      body: document,
    }, bodyOnSuccess(callback));
  }
  bulkDocuments(docs, opts, callback) {
    assert.ok(typeof docs === 'object');
    let payload = { docs };
    if (typeof opts === 'function') {
      callback = opts;
    } else if (typeof opts === 'object') {
      payload = Object.assign(payload, pick(opts, 'all_or_nothing', 'new_edits'));
    }
    return this.execute({
      method: 'post',
      path: `/${this.database}/_bulk_docs`,
      body: payload,
    }, bodyOnSuccess(callback));
  }
  bulkGet(docs, opts, callback) {
    assert.ok(typeof docs === 'object');
    let payload = { docs };
    if (typeof opts === 'function') {
      callback = opts;
    } else if (typeof opts === 'object') {
      payload = Object.assign(payload, pick(opts, 'attachments', 'revs'));
    }

    function handleMultipart(callback) {
      return function (error, response) {
        //response.res.pipe(transform);
        callback(error, response);
      };
    }
    return this.execute({
      method: 'post',
      path: `/${this.database}/_bulk_get`,
      body: payload,
      Transform: MultipartStream,
    },
    handleMultipart(callback));
  }
  get(id, opts, callback) {
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
    }, bodyOnSuccess(callback));
  }
  deleteDesignDoc(name, callback) {
    assert.ok(name);
    return this.execute({
      method: 'delete',
      path: `/${this.database}/_design/${name}`,
    }, bodyOnSuccess(callback));
  }
  getDesignDoc(name, callback) {
    assert.ok(name);
    return this.execute({
      method: 'get',
      path: `/${this.database}/_design/${name}`,
    }, bodyOnSuccess(callback));
  }
  saveDesignDoc(name, designDoc, callback) {
    assert.ok(name);
    return this.execute({
      method: 'get',
      path: `/${this.database}/_design/${name}`,
      body: designDoc,
    }, bodyOnSuccess(callback));
  }
}

exports.SyncGateway = SyncGateway;

/* eslint-disable no-underscore-dangle */
const assert = require('assert');
const superagent = require('superagent');

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

  return listOfNames.reduce((result, name) => {
    if (name in object) {
      return Object.assign({}, result, { [name]: object[name] });
    }
    return result;
  }, {});
}

function extractSession(response) {
  const cookieHeaders = response.headers['set-cookie'];
  if (!cookieHeaders) {
    return null;
  }
  const sessionCookies = cookieHeaders
  .map(headerValue => headerValue.split(/; /).reduce((obj, part) => {
    const [partName, partValue] = part.split(/=/);
    return Object.assign(obj, { [partName]: partValue });
  }, {}))
  .filter(cookie => cookie.SyncGatewaySession);
  if (sessionCookies.length > 0) {
    return sessionCookies[0];
  }
  return null;
}

class BaseSyncGateway {
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
      const session = extractSession(response);

      if (session) {
        this.sessionCookie = session;
        callback(null, this.sessionCookie);
        return;
      }
      const error = Error('Failed to create a new session');
      error.response = response;
      if (callback) callback(error);
    }

    return this.execute({
      method: 'POST',
      path: `/${this.database}/_session`,
      body: { name, password },
    }, _callback.bind(this));
  }

  createFacebookSession(accessToken, email, remoteURL, callback) {
    assert.ok(accessToken);
    assert.ok(email);
    assert.ok(remoteURL);
    this.sessionCookie = undefined;

    return this.execute({
      method: 'post',
      path: `/${this.database}/_facebook`,
      body: { access_token: accessToken, email, remote_url: remoteURL },
    }, (error, response) => {
      const session = extractSession(response);
      if (session) {
        this.sessionCookie = session;
        callback(null, this.sessionCookie);
      } else {
        callback(new Error('No Session'));
      }
    });
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
    const options = typeof opts === 'object' ? opts : {};
    const params = {};
    if (options.rev) params.rev = options.rev;
    if (options.expiry instanceof Date) params.exp = options.expiry.toISOString();
    else if (options.ttl) params.exp = options.ttl;

    return this.execute({
      method: 'put',
      path: `/${this.database}/${_id}`,
      body: document,
      query: params,
    }, bodyOnSuccess(typeof opts === 'function' ? opts : callback));
  }

  create(document, opts, callback) {
    assert.ok(typeof document === 'object');
    const options = typeof opts === 'object' ? opts : {};

    return this.execute({
      method: 'post',
      path: `/${this.database}/`,
      body: document,
      query: options,
    }, bodyOnSuccess(typeof opts === 'function' ? opts : callback));
  }

  bulkDocuments(docs, opts, callback) {
    assert.ok(typeof docs === 'object');
    let payload = { docs };
    if (typeof opts === 'object') {
      payload = Object.assign(payload, pick(opts, 'all_or_nothing', 'new_edits'));
    }
    return this.execute({
      method: 'post',
      path: `/${this.database}/_bulk_docs`,
      body: payload,
    }, bodyOnSuccess(typeof opts === 'function' ? opts : callback));
  }

  get(id, opts, callback) {
    assert.ok(id);
    const options = opts || {};
    const params = {};
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

  deleteDoc(id, rev, callback) {
    assert.ok(id);
    assert.ok(rev);
    const params = { rev };

    return this.execute({
      method: 'delete',
      path: `/${this.database}/${id}`,
      query: params,
    }, bodyOnSuccess(callback));
  }
}

class SyncGateway extends BaseSyncGateway {
}

class SyncGatewayAdmin extends BaseSyncGateway {
  createUser(user, callback) {
    assert.ok(user.name);
    assert.ok(user.password);
    return this.execute({
      method: 'post',
      body: user,
      path: `/${this.database}/_user/`,
    }, callback);
  }

  updateUser(user, callback) {
    assert.ok(user.name);
    assert.ok(user.password);
    return this.execute({
      method: 'put',
      body: user,
      path: `/${this.database}/_user/${user.name}`,
    }, callback);
  }

  getUser(name, callback) {
    assert.ok(name);
    return this.execute({
      method: 'get',
      path: `/${this.database}/_user/${name}`,
    }, (error, response) => {
      if (response.statusType === 2) {
        callback(error, JSON.parse(response.text));
      } else {
        callback(error, response);
      }
    });
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
      method: 'put',
      path: `/${this.database}/_design/${name}`,
      body: designDoc,
    }, bodyOnSuccess(callback));
  }
}
exports.SyncGateway = SyncGateway;
exports.SyncGatewayAdmin = SyncGatewayAdmin;

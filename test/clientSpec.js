/* globals it, describe */
/* eslint-env node, mocha */
/* eslint-disable prefer-arrow-callback */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-unused-expressions */
/* eslint-disable func-names */

const chai = require('chai');
const dirtyChai = require('dirty-chai');
const SyncGateway = require('../lib/client').SyncGateway;
const SyncGatewayAdmin = require('../lib/client').SyncGatewayAdmin;

global.Promise = require('bluebird').Promise;

chai.use(dirtyChai);
const expect = chai.expect;
const client = new SyncGateway({ host: 'localhost', port: 4984, database: 'sample' });
const admin = new SyncGatewayAdmin({ host: 'localhost', port: 4985, database: 'sample' });

Promise.config({
  // Enable warnings
  warnings: true,
  // Enable long stack traces
  longStackTraces: true,
  // Enable cancellation
  cancellation: true,
  // Enable monitoring
  monitoring: true,
});

describe('Client Library', function () {
  it('Can get server info', function GetServerInfo(done) {
    client.serverInfo((error, response) => {
      expect(response.couchdb).to.exist;
      done(error);
    });
  });
  it('Can create session with proper credentials', function (done) {
    client.session({ name: 'alice', password: 'password' }, (error, session) => {
      expect(session.SyncGatewaySession).to.exist;
      done(error);
    });
  });
  it('Cannot create a session with inproper credentials', function (done) {
    client.session({ name: 'alice', password: 'xyz' }, (error, session) => {
      expect(error).to.be.an.instanceOf(Error);
      expect(session).to.not.exist;
      done();
    });
  });
  describe('When authenticated', function () {
    before(function (done) {
      client.session({ name: 'alice', password: 'password' }, done);
    });
    it('Can retrieve database information client', function (done) {
      client.getDatabase((error, result) => {
        expect(result).to.exist;
        done(error);
      });
    });
    describe('Writing Documents', function () {
      it('Can put document', function (done) {
        const id = new Date().getTime();
        client.createOrUpdate(`DB${id}`, { timestamp: id }, {}, (error, response) => {
          expect(response.id).to.exist;
          expect(response.rev).to.exist;
          expect(response.ok).to.be.ok;
          done(error);
        });
      });
      it('Cannot update document without revision', function (done) {
        const id = new Date().getTime();
        client.createOrUpdate(`DB${id}`, { timestamp: id }, {}, (error, response) => {
          expect(response.ok).to.be.ok;
          client.createOrUpdate(response.id, { timestamp: id + 1 }, {}, (error2) => {
            expect(error2).to.be.instanceOf(Error);
            done();
          });
        });
      });
      it('Can put document with revision', function (done) {
        const id = new Date().getTime();
        client.createOrUpdate(`DB${id}`, { timestamp: id }, {}, (error, response) => {
          expect(response.ok).to.be.ok;
          client.createOrUpdate(response.id,
            { timestamp: id + 1 },
            { rev: response.rev },
            (error2, result2) => {
              expect(error2).to.not.exist;
              expect(result2).to.exist;
              expect(result2.timestamp).to.exist;
              done(error2);
            });
        });
      });
      it('Can delete document', function (done) {
        const id = new Date().getTime();
        client.create({ _id: `DB${id}`, name: 'John' }, (error, response) => {
          if (error) done;
          else {
            expect(response.ok).to.be.ok;
            client.deleteDoc(response.id, response.rev, done);
          }
        });
      });
      it('Can create documents in bulk', function (done) {
        client.bulkDocuments([{ docId: 1 }, { docId: 2 }], (error, result) => {
          expect(result).to.be.instanceOf(Array);
          expect(result).to.have.lengthOf(2);
          done(error);
        });
      });
    });
  });
});

describe('Admin Gateway', function () {
  it('Can create a user', (done) => {
    const name = `DB${new Date().getTime()}`;
    admin.createUser({
      name,
      password: '123456',
    }, (error) => {
      expect(error).to.not.exist;
      admin.getUser(name, (error, user) => {
        expect(error).to.not.exist;
        expect(user).to.exist;
        expect(user.name).to.equal(name);
        done(error);
      });
    });
  });
  it('Can update a user', (done) => {
    const name = `DB${new Date().getTime()}`;
    admin.createUser({
      name,
      password: '123456',
    }, (error) => {
      expect(error).to.not.exist;
      admin.updateUser({
        name,
        password: '111111',
      }, (error2) => {
        expect(error2).to.not.exist;
        done(error2);
      });
    });
  });
  it.skip('Can create a facebook linked session', (done) => {
    const accessToken = process.env.FB_ACCESS_TOKEN;
    const email = 'bfwarner@gmail.com';
    const remoteURL = 'http://localhost:4984';
    expect(accessToken).to.exist;
    client.createFacebookSession(accessToken, email, remoteURL, (error, response) => {
      expect(error).to.not.exist;
      const session = response.session;
      expect(session).to.exist;
      expect(session.session_id).to.exist;
      expect(session.expires).to.exist;
      expect(session.cookie_name).to.exist;
      done(error);
    });
  });

  it('Can create a session', (done) => {
    const name = `DB${new Date().getTime()}`;
    const password = '123456';
    admin.createUser({
      name,
      password,
    }, (error) => {
      expect(error).to.not.exist;
      client.session({ name, password }, (error2, response) => {
        expect(error2).to.not.exist;
        const session = response.session;
        expect(session).to.exist;
        expect(session.session_id).to.exist;
        expect(session.expires).to.exist;
        expect(session.cookie_name).to.exist;
        done(error2);
      });
    });
  });
  describe('When database already exists', function () {
    it('Cannot create duplicate database', (done) => {
      const name = `DB${new Date().getTime()}`;
      admin.createDatabase(name, (error, result) => {
        expect(result).to.not.be.ok;
        admin.createDatabase(name, (error2) => {
          expect(error2).to.exist;
          done();
        });
      });
    });
  });
  describe('Design Documents', function () {
    it('Can Save a Design Doc', function (done) {
      const designDoc = {
        views: {
          MyView: {
            map: 'function(doc) { if (doc.name) emit(doc.name, null)}',
          },
        },
      };

      const name = Object.keys(designDoc.views)[0];
      admin.saveDesignDoc(name, JSON.stringify(designDoc), function (err) {
        if (err) done(err);
        else {
          admin.getDesignDoc(name, function (err2, result2) {
            if (err2) done(err2);
            else {
              expect(result2).to.exist;
              admin.deleteDesignDoc(name, done);
            }
          });
        }
      });
    });
  });
});
/* eslint-enable prefer-arrow-callback */

/* globals it, describe */
/* eslint-env node, mocha */
/* eslint-disable prefer-arrow-callback */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-unused-expressions */
/* eslint-disable func-names */

const chai = require('chai');
const dirtyChai = require('dirty-chai');
const SyncGateway = require('../lib/client').SyncGateway;
global.Promise = require('bluebird').Promise;

chai.use(dirtyChai);
const expect = chai.expect;
const client = new SyncGateway({ host: 'localhost', port: 4984, database: 'sample' });

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

describe('Client Library', function ClientLibrary() {
  it('Can get server info', function GetServerInfo() {
    return client.serverInfo().then(response => {
      expect(response.body.couchdb).to.exist;
    });
  });
  it('Can create session with proper credentials', function Login() {
    return client.session('alice', 'password').then((session) => {
      expect(session.SyncGatewaySession).to.exist;
    });
  });
  it('Cannot create a session with inproper credentials', function Login() {
    return client.session('alice', 'xyz').then((session) => {
      chai.fail('Did not expect promise to be resolved');
      expect(session.SyncGatewaySession).to.not.exist;
    })
    .catch(error => {
      expect(error).to.exist;
    });
  });
  describe('When authenticated', () => {
    before(() => client.session('alice', 'password'));
    it('Can retrieve database information client', () =>
       client.getDatabase()
            .then(result => {
              expect(result).to.exist;
            })
    );

    describe('Writing Documents', function () {

      it('Can put document', function() {
        const id = new Date().getTime();
        client.createOrUpdate(`DB${id}`, { timestamp: id })
              .then((response) => {
                expect(response.id).to.exist;
                expect(response.rev).to.exist;
                expect(response.ok).to.be.ok;
              });
      });
      it('Can put document without revision', function() {
        const id = new Date().getTime();
        return client.createOrUpdate(`DB${id}`, { timestamp: id })
                     .then((response) => {
                       expect(response.ok).to.be.ok;
                       return client.createOrUpdate(response.id, { timestamp: id + 1 });
                     })
                     .then(response => {
                       chai.assert.fail('did expect update to succeed without revision');
                     })
                     .catch(() => 0);
      });
      it('Can put document with revision', function() {
        const id = new Date().getTime();
        return client.createOrUpdate(`DB${id}`, { timestamp: id })
                     .then((response) => {
                       expect(response.ok).to.be.ok;
                       return client.createOrUpdate(response.id,
                                                    { timestamp: id + 1 },
                                                    { rev: response.rev });
                     });
      });
      it('Cannot read document expired document', function () {
        const id = new Date().getTime();
        return client.createOrUpdate(`_local/DB${id}`, { timestamp: id, _exp: 1 })
                     .then((response) => {
                       expect(response.id).to.exist;
                       expect(response.rev).to.exist;
                       expect(response.ok).to.be.ok;
                       return Promise.delay(5000)
                                     .then(() => client.get(response.id))
                                     .then((response) => {
                                       console.log(`responses  ${response}`);
                                       return response;
                                      },
                                     (error) => {
                                       expect(error.status).to.be.equal(404);
                                       return error;
                                     });
                     });
      });
    });
    describe.skip('When database does not already exists', function () {
      it('Can create database', () => {
        const name = `DB${new Date().getTime()}`;
        return client.createDatabase(name)
              .then(result => {
                expect(result).to.exist;
              });
              // ,error => chai.assert.fail(`could create Database ${name}, error ${error}`));
      });
    });
    describe.skip('When database already exists', function () {
      it('Cannot create duplicate database', () => {
        const name = `DB${new Date().getTime()}`;
        client.createDatabase(name)
              .then(result => {
                expect(result).to.not.be.ok;
                return client.createDatabase(name);
              })
              .catch(error => {
                console.log(`error ${error}`);
              });
      });
    });
  });
});
/* eslint-enable prefer-arrow-callback */

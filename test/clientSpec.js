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
    client.session('alice', 'password', (error, session) => {
      expect(session.SyncGatewaySession).to.exist;
      done(error);
    });
  });
  it('Cannot create a session with inproper credentials', function (done) {
    client.session('alice', 'xyz', (error, session) => {
      expect(error).to.be.an.instanceOf(Error);
      expect(session).to.not.exist;
      done();
    });
  });
  describe('When authenticated', function () {
    before(function (done) {
      client.session('alice', 'password', done);
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
      it('Can create documents in bulk', function (done) {
        client.bulkDocuments([{ docId: 1 }, { docId: 2 }], (error, result) => {
          expect(result).to.be.instanceOf(Array);
          expect(result).to.have.lengthOf(2);
          done(error);
        });
      });
      it.skip('Can get documents in bulk', function (done) {
        client.bulkDocuments([{ docId: 1 }, { docId: 2 }], (error, result) => {
          client.bulkGet(result, (error2, response) => {
            done(error);
          });
        });
      });
    });
  });
});

describe('Admin Gateway', function () {
  describe('When database does not already exists', function () {
    it('Can create database', (done) => {
      const name = `DB${new Date().getTime()}`;
      admin.createDatabase(name, (error, result) => {
        expect(error).to.exist;
        done();
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
      admin.saveDesignDoc(name, JSON.stringify(designDoc), function (err, result) {
        if (err) done(err);
        else {
          admin.getDesignDoc(name, function (err2, result2) {
            if (err2) done(err2);
            else admin.deleteDesignDoc(name, done);
          });
        }
      });
    });
  });
});
/* eslint-enable prefer-arrow-callback */

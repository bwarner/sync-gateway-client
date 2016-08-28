/* eslint-env node, mocha */
/* eslint-disable prefer-arrow-callback */

const SyncGateway = require('../lib/client').SyncGateway;

describe('Client Library', function ClientLibrary() {
  it('Can get server info', function GetServerInfo() {
    const client = new SyncGateway({ host: 'localhost', port: 4984, database: 'sync_gateway' });
    return client.serverInfo();
  });
});
/* eslint-enable prefer-arrow-callback */

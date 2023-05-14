#!/usr/bin/env node
import { startSlashpayClient } from './client/client.js';
import { startSlashpayServer } from './server/server.js';

const command = process.argv[2];
(async () => {
  if (command === 'server') {
    startSlashpayServer().then();
  } else {
    await startSlashpayClient();
    process.exit();
  }
})();

import b4a from "b4a";
import {formatDidUri} from "../url-utils.js";
import { DHT } from 'dht-universal';
import Hyperswarm from 'hyperswarm';
import Corestore from 'corestore';
import chalk from 'chalk';
import {generateQRCode} from "./qr-code.js";
import {
    getWalletInfo,
    getSupportedMethods,
    runMethod,
    runSubscribe,
} from './server-helpers.js';
import inquirer from "inquirer";
import {CERT, MACAROON, SOCKET} from "../config.js";
import fs from "fs";

/**
 * Handles the response from the LND node.
 * - Checks if the method is supported.
 * - Runs the method.
 * - Subscribes to the method.
 * @param data
 * @param onInvoice
 * @param onReceipt
 * @returns {Promise<void>}
 */
const lnNodeResponse = async (data, onInvoice, onReceipt) => {
  // Grab an array of supported methods, if any.
  const supportedMethods = getSupportedMethods(data.methods);
  // Attempt to run the first supported method. Returns error if undefined.
  const methodResponse = await runMethod(supportedMethods[0], data);
  onInvoice(methodResponse);
  if (!methodResponse.error) {
    await runSubscribe(methodResponse.method, methodResponse.id, onReceipt);
  }
}


/**
 * Creates the slashpay server.
 * @param callback
 * @returns {Promise<void>}
 */
const createSlashpayServer = async (callback) => {
  const dht = await DHT.create({});
  const corestore = new Corestore('store');
  await corestore.ready();
  const swarm = new Hyperswarm({ dht });

  swarm.on('connection', (connection, info) => corestore.replicate(connection));

  const server = dht.createServer((noiseSocket) => {
    noiseSocket.on('open', () => {
      noiseSocket.on('data', async (data) => {
        const request = JSON.parse(data.toString());
        console.log(
            '\n>> received request:\n   ',
            'pay:',
            chalk.green.bold(request.amount),
            'sats, over:',
            chalk.green.bold(request.methods.join(' or ')),
            '\n    with description:',
            chalk.green(request.description),
        );
        callback(
            request,
            (invoice) => noiseSocket.write(Buffer.from(JSON.stringify(invoice))),
            (reciept) => {
              console.log('\nsending receipt...');
              noiseSocket.write(Buffer.from(JSON.stringify(reciept)));
            },
        );
      });
    });
  });
  const keyPair = DHT.keyPair();
  server.listen(keyPair);

  const address = 'hyper:peer://' + b4a.toString(keyPair.publicKey, 'hex');
  console.log(
      '\n>> Lightning node listening on:\n   ',
      chalk.blue.bold(address),
  );

  const core = corestore.get({
    name: 'main slashtags identity',
    valueEncoding: 'json',
  });

  await core.ready();

  await swarm
      .join(core.discoveryKey, { server: true, client: false })
      .flushed();

  await core.append({
    services: [{ id: '#slashpay', type: 'SlashPay', serviceEndpoint: address }],
  });

  const slashtag = formatDidUri(core.key);
  console.log(
      '\n>> Added the new address to:\n   ',
      chalk.yellow.bold(slashtag),
  );

  await generateQRCode(slashtag);
};

const promptUserInput = async (previousConfigs) => {
  return inquirer.prompt([
    {
      type: 'input',
      name: 'cert',
      message: 'Add path to LND CERT',
      default: previousConfigs?.cert ?? CERT,
    },
    {
      type: 'input',
      name: 'macaroon',
      message: 'Add path to LND MACAROON',
      default: previousConfigs?.macaroon ?? MACAROON,
    },
    {
      type: 'input',
      name: 'socket',
      message: 'Add LND SOCKET',
      default: previousConfigs?.socket ?? SOCKET,
    },
  ]);
}

const loadPreviousConfig = async () => {
  try {
    const json = await fs.readFileSync('cached-config.json', 'utf8');
    if (json.trim() === '') {
      return {};
    }
    return JSON.parse(json);
  } catch (e) {
    return {};
  }
};

const saveConfig = async (answers) => {
  try {
    fs.writeFile(
        'cached-config.json',
        JSON.stringify(answers),
        () => {},
    );
  } catch (error) {}
}

/**
 * Starts the slashpay server.
 * - Checks if the LND node is running.
 * - Creates the slashpay server.
 * - Generates a QR code for the slashpay server.
 * @returns {Promise<void>}
 */
export const startSlashpayServer = async () => {
  const previousConfig = await loadPreviousConfig();
  const answers = await promptUserInput(previousConfig);
  await saveConfig(answers);

  const walletInfo = await getWalletInfo();
  if (walletInfo.error) {
    console.log('\nUnable to connect to LND node.', walletInfo.data);
    process.exit();
    return;
  }
  console.log(`\nNode found with alias: ${walletInfo.data.alias}`);
  await createSlashpayServer(lnNodeResponse);
}

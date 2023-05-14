import { DHT } from 'dht-universal';
import Hyperswarm from 'hyperswarm';
import Corestore from 'corestore';
import { parseDidUri } from '../url-utils.js';
import chalk from 'chalk';
import cliSpinners from 'cli-spinners';
import logUpdate from 'log-update';
import inquirer from 'inquirer';
import {saveReceipt} from '../helpers.js';
import fs from 'fs';
import {dirname} from "path";
import {fileURLToPath} from "url";

const spinner = cliSpinners['moon'];

const loadLastTimeChoices = async () => {
  try {
    const json = await fs.readFileSync('cached-choices.json', 'utf8');
    if (json.trim() === '') {
      return [];
    }
    return JSON.parse(json);
  } catch (e) {
    return [];
  }
};

const promptUserInput = async (lasttime) => {
  return inquirer.prompt([
    {
      type: 'input',
      name: 'slashtag',
      message: 'Select a Slashtag to pay',
      default: lasttime?.slashtag ?? 'slashpay:b5uas6fgceegybkb4weqjynjfq2eqz2uplhgrpzfqesbj2wymyyfnxji',
    },
    {
      type: 'list',
      name: 'preferredMethod',
      message: 'Select your preferred payment method',
      choices: ['bolt11', 'p2wpkh', 'p2sh', 'p2pkh'],
      default: 'bolt11',
    },
    {
      type: 'list',
      name: 'fallbackMethod',
      message: 'Select an alternative payment method',
      choices: ['bolt11', 'p2wpkh', 'p2sh', 'p2pkh'],
      default: 'p2wpkh',
    },
    {
      type: 'input',
      name: 'amount',
      message: 'Enter the amount to pay',
      default: lasttime?.amount ?? 10000,
    },
    {
      type: 'input',
      name: 'description',
      message: 'Enter a description',
      default: lasttime?.description ?? 'Having fun with slashpay',
    },
    {
      type: 'input',
      name: 'useCache',
      message: 'Use cache y/N',
      default: 'N',
    },
  ]);
}

const createCorestoreAndSwarm = async (relays = ['wss://dht-relay.synonym.to']) => {
    //const dht = await DHT.create({relays});
    const dht = await DHT.create({});
    const corestore = new Corestore('client-store');
    await corestore.ready();
    const swarm = new Hyperswarm({ dht });

    swarm.on('connection', (connection, info) => corestore.replicate(connection));

    return { dht, corestore, swarm };
}

const saveChoices = async (slashtag, amount, description) => {
  try {
    fs.writeFile(
        'cached-choices.json',
        JSON.stringify({ slashtag, amount, description }),
        () => {},
    );
  } catch (error) {}
}

const joinSwarmAndUpdateCore = async (core, swarm, useCache) => {
  let interval;
  if (core.length === 0 || useCache.toLowerCase() === 'n') {
    const timerLabel = '         resolved in';
    console.time(timerLabel);
    await swarm.join(core.discoveryKey, { server: false, client: true });

    let i = 0;
    interval = setInterval(() => {
      const { frames } = spinner;
      logUpdate('   ' + frames[(i = ++i % frames.length)] + ' Resolving...');
    }, spinner.interval);

    await swarm.flush();
    clearInterval(interval); // clear the interval as soon as flush is done
    await core.update();

    if (core.length === 0) {
      clearInterval(interval); // ensure the interval is cleared in case of an error
      throw new Error('No slashtags document found for' + slashtag);
    }
    console.timeEnd(timerLabel);
  }
}

const getSlashpayService = async (latest) => {
  if (!latest?.services || latest.services.length === 0) {
    throw new Error('No slashtags services found for' + slashtag);
  }

  return latest.services.find(
      (service) => service.type === 'SlashPay',
  );
}

const handleNoiseSocketEvents = async (noiseSocket, preferredMethod, fallbackMethod, amount, description) => {
  let interval; // move the interval variable declaration outside the event listeners
  return new Promise((resolve) => {
    noiseSocket.on('error', (error) => {
      clearInterval(interval); // ensure the interval is cleared in case of an error
      console.log(
          '>> ',
          chalk.red.bold(error.message),
          chalk.red.bold('please try again with skipping cache'),
      );
      resolve();
    });

    noiseSocket.on('open', function () {
      noiseSocket.write(
          JSON.stringify({
            methods: [preferredMethod, fallbackMethod],
            amount,
            description,
          }),
      );

      noiseSocket.on('data', (data) => {
        const response = JSON.parse(data.toString());

        let i = 0;

        if (response.error === true) {
          clearInterval(interval); // clear the interval as soon as an error is received
          console.log('\n>> Got an error:\n   ', chalk.bold.red(response.data));
          resolve(response.data.toString());
          return;
        } else if (response.orderId !== undefined) {
          clearInterval(interval); // clear the interval as soon as an order id is received
          console.log(
              '\n>> Got a receipt for:',
              chalk.green.bold(response.data.sats), 'sats',
              '\n     orderId:', chalk.green.bold(response.orderId),
              '\n     data:',
              chalk.green.bold(JSON.stringify(response.data, null, 7)),
          );

          const __dirname = dirname(fileURLToPath(import.meta.url));
          saveReceipt(response, __dirname);

          resolve(response.data.toString());
          return;
        } else {
          interval = setInterval(() => {
            const { frames } = spinner;
            logUpdate(
                '   ' +
                frames[(i = ++i % frames.length)] +
                ' waiting for payment...',
            );
          }, spinner.interval);
          console.log(
              '\n>> Got ',
              chalk.bold.green(response.method),
              ':\n   ',
              chalk.bold.green(response.data),
          );
          console.log('\n');
        }
      });
    });
  });
}

export const startSlashpayClient = async () => {
  const lasttime = await loadLastTimeChoices();
  const answers = await promptUserInput(lasttime);
  const {dht, corestore, swarm} = await createCorestoreAndSwarm();

  const {
    slashtag,
    amount,
    description,
    useCache,
    preferredMethod,
    fallbackMethod,
  } = await answers;

  if (!slashtag) {
    console.log('No slashtag provided');
    process.exit();
  }
  if (!amount) {
    console.log('No amount provided');
    process.exit();
  }

  await saveChoices(slashtag, amount, description);

  console.log(
      '\n>> Resolving slashtags document for:\n   ',
      chalk.yellow.bold(slashtag),
  );

  let key;
  try {
    const res = parseDidUri(slashtag);
    key = res.key;
  } catch (error) {
    console.warn('Invalid slashtag:', slashtag);
    process.exit();
  }
  if (!key) {
    console.warn('Invalid slashtag:', slashtag);
    process.exit();
  }

  const core = corestore.get({ key, valueEncoding: 'json' });
  await core.ready();

  await joinSwarmAndUpdateCore(core, swarm, useCache);

  const latest = await core.get(core.length - 1);

  const slashpay = await getSlashpayService(latest);

  console.log(
      '\n>> Connecting slashtags pay address:\n   ',
      chalk.blue.bold(slashpay.serviceEndpoint),
  );

  const swarmAddress = slashpay.serviceEndpoint.replace('hyper:peer://', '');

  try {
    Buffer.from(swarmAddress, 'hex');
  } catch (error) {
    console.warn('Invalid slashtags pay address:', slashpay.serviceEndpoint);
    process.exit();
  }

  const noiseSocket = dht.connect(Buffer.from(swarmAddress, 'hex'));
  return handleNoiseSocketEvents(noiseSocket, preferredMethod, fallbackMethod, amount, description);
};

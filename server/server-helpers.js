import * as lns from "ln-service";
import {v4 as uuidv4} from "uuid";
import {readFileSync} from "fs";
import {CERT, MACAROON, SOCKET, SUPPORTED_METHODS} from "../config.js";
import Bottleneck from "bottleneck";
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { saveReceipt } from "../helpers.js";

const toB64 = (path) => readFileSync(path, { encoding: 'base64' });

const { lnd } = lns.authenticatedLndGrpc({
    cert: toB64(CERT),
    macaroon: toB64(MACAROON),
    socket: SOCKET
});

const limiter = new Bottleneck({
    maxConcurrent: 5,
    minTime: 1000
});

/**
 * Returns wallet info from the lightning node.
 * @returns {Promise<{ data: any, id: string, error: boolean }>}
 */
export const getWalletInfo = async () => {
    try {
        const res = await lns.getWalletInfo({lnd});
        if (res) return { error: false, data: res, id: '' };
        return { error: true, data: 'Error retrieving wallet info.', id: '' };
    } catch (e) {
        return { error: true, data: e, id: '' };
    }
};

/**
 * Generates a bolt11 invoice from the lightning node.
 * @param {number} tokens
 * @param {string} description
 * @returns {Promise<{ error: boolean, data: string, id: string }>}
 */
export const generateInvoice = async ({ tokens, description }) => {
    const getChannelsResponse = await lns.getChannels({lnd});
    const channels = getChannelsResponse.channels;

    let routingHints = [];
    let channelInfoPromises = channels.map(channel =>
        lns.getChannel({lnd, id: channel.id}).then(channelInfo => {
            const policy = channelInfo.policies.find(policy => policy.public_key === channel.partner_public_key);
            routingHints.push({
                channel: channelInfo.id,
                node: channel.partner_public_key,
                base_fee_mtokens: policy.base_fee_mtokens,
                fee_rate: policy.fee_rate,
                cltv_delta: channel.local_csv,
                min_htlc_mtokens: channel.local_min_htlc_mtokens
            });
        })
    );
    await Promise.all(channelInfoPromises);

    const invoice = await lns.createInvoice({lnd, tokens, description, routes: [routingHints]});

    const error = !invoice?.request;
    const data = invoice?.request ?? 'Unable to retrieve an invoice at this time.';
    const id = error ? '' : invoice?.id;
    return { error, data, id };
}

/**
 * Returns a new address from the lightning node.
 * @param {'p2wpkh' | 'p2sh' | 'p2pkh'} format
 * @returns {Promise<{ error: boolean, data: string, id: string }>}
 */
export const generateAddress = async (format = 'p2wpkh') => {
    const {address} = await lns.createChainAddress({format, lnd});
    const error = !address;
    const data = !address ? 'Unable to retrieve an address at this time.' : address;
    return {error, data, id: data};
}

export const subscribeToInvoice = async (invoiceIdHexString, callback) => {
    const sub = lns.subscribeToInvoice({id: invoiceIdHexString, lnd});
    sub.on('invoice_updated', (data) => {
        //TODO: Ensure the proper amount has been received.
        if (data?.received > 0) {
            const receipt = {
                orderId: uuidv4(),
                data: {
                    id: data?.id,
                    sats: data?.received,
                    description: data?.description,
                },
                error: !data,
                timestamp: new Date().toISOString(),
            };
            callback(receipt);
            console.log('\nReceipt:', receipt);
            console.log('\n');

            const __dirname = dirname(fileURLToPath(import.meta.url));
            // Save the receipt to receipts.json
            saveReceipt({...receipt, data}, __dirname);

            sub.abort();
        }
    });
};

export const subscribeToAddress = async (address = '', addressType = 'bech32', callback) => {
    if (addressType === 'p2wpkh') addressType = 'bech32';
    const sub = lns.subscribeToChainAddress({
        lnd,
        [`${addressType}_address`]: address,
        min_height: 1,
        min_confirmations: 0
    });
    sub.on('confirmation', (data) => {
        const receipt = {
            orderId: uuidv4(),
            error: !data,
            data: data?.transaction,
            timestamp: new Date().toISOString()
        };
        callback(receipt);
        // Save the receipt to receipts.json
        const __dirname = dirname(fileURLToPath(import.meta.url));
        saveReceipt({...receipt, data}, __dirname);
        sub.abort();
    });
}

export const methodIsSupported = (method) => SUPPORTED_METHODS.includes(method);
export const getSupportedMethods = (methods) => methods.filter((method) => methodIsSupported(method));

export const runMethod = async (method, data) => {
    let response = { error: true, data: 'No supported payment method is available.', id: '' };
    if (!method) return response;
    switch (method) {
        case 'bolt11':
            response = await limiter.schedule(() => generateInvoice({ tokens: Number(data.amount), description: data.description }));
            break;
        case 'p2wpkh':
        case 'p2sh':
        case 'p2pkh':
            response = await limiter.schedule(() => generateAddress(method));
            break;
        default:
            break;

    }
    return { method, ...response };
}

/**
 * Runs the subscribe method based on the method type.
 * @param method
 * @param id
 * @param callback
 * @returns {Promise<{data: string, error: boolean}>}
 */
export const runSubscribe = async (method, id, callback) => {
    let data = { error: true, data: 'No supported payment method is available.' };
    if (!method) return data;
    switch (method) {
        case 'bolt11':
            await limiter.schedule(() => subscribeToInvoice(id, callback));
            break;
        case 'p2wpkh':
        case 'p2sh':
        case 'p2pkh':
            await limiter.schedule(() => subscribeToAddress(id, method, callback));
            break;
        default:
            break;
    }
}

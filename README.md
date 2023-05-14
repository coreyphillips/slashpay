# SlashPay

[Read more](https://docs.google.com/document/d/10rgPbDMer6uL7L8QZ5ve-KU_pkI_YSwSO4dmzUmjU6s/edit)

## Install

```
npm i -g slashpay
```

## Usage
```
slashpay
```

### Retrieving Invoices & Addresses With SlashPay
If you have a Slashtag from someone running a SlashPay server and wish to retrieve an invoice or address from them, simply install SlashPay with:
- `npm i -g slashpay`

Once installed type `slashpay` in the terminal and follow the prompts. It will prompt you for the following:
1. Slashtag (Ex:`slashpay://b5uaurrgdr...3ef7qt3kfyey`)
2. Preferred Payment Method (Ex: `bolt11`, `p2wpkh`, etc.)
3. Amount to pay in satoshis (Ex: `500`)
4. Description (Ex: `SlashPay is pretty cool.`)

###  SlashPay Server Setup

#### Prerequisites
- LND
    - [Installation instructions.](https://github.com/lightningnetwork/lnd/blob/master/docs/INSTALL.md#installation)
    - Ensure LND is built with the correct sub-servers.
        - Ex: `make install tags="signrpc walletrpc chainrpc invoicesrpc routerrpc monitoring"`
- Access and knowledge of the paths to:
    - `admin.macaroon`
    - `tls.cert`
    - Socket Info (Ex: 127.0.0.1: 10009)

#### Start Server
```bash
slashpay server
```
- Run `slashpay server` in the terminal
    - Slashpay will prompt you for thes paths mentioned above and do its best to find the default paths for you.
    - This will generate a slashtag (`slashpay:b5uat...`) for you to share with others.

### Description

SlashPay is a method for using Slashtags & Hypercore to abstract ALL Bitcoin payment negotiation processes, features, options, communication, and server endpoints to occur outside of the nodes and without limiting a payment to any single format.

Slashtags users communicate and authenticate using off-chain keypairs used as dynamic addresses that ultimately point to a public document using the DID specification and Hypercore’s Hyperswarm/DHT. This is a totally self-sovereign process for counterparties to specify which payment methods they support, their preferred payment methods, as well as any appropriate metadata related to the payment orders, including payment amounts and metadata.

Each payment is abstracted into a unique order ID, and payees can monitor for a successful payment across multiple payment methods before acknowledgment of receipt before delivering goods or services.

Payers can specify which payment method they prefer as well as request multiple payment type options they can pay to.


For example:

Alice wants to buy an e-book from Bob.

Alice uses Bob’s Slashtag (pubkey) to look up his DID document on the Hyperswarm, learning which payment methods Bob supports.

Alice happens to be able to pay with native segwit, taproot and Lightning, but Bob only lists native segwit and Lightning.

Bob sends Alice an invoice for the desired payment amount on Lightning, as well as an address for paying that amount into a unique native segwit “bc1q…” address.

Alice pays Bob over Lightning, Bob delivers a receipt proof, allowing Alice to retrieve the e-book from Bob.

[Read more here...](https://docs.google.com/document/d/10rgPbDMer6uL7L8QZ5ve-KU_pkI_YSwSO4dmzUmjU6s/edit)

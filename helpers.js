import {join} from "path";
import {existsSync, readFileSync, writeFileSync} from "fs";
/**
 * Save a receipt to the receipts.json file in the specified path.
 * @param receipt
 * @param filePath
 * @returns {Promise<void>}
 */
export const saveReceipt = async (receipt, filePath) => {
    const receiptPath = join(filePath, 'receipts.json'); // Adjust the path as necessary
    let receipts = [];
    try {
        if (existsSync(receiptPath)) {
            const existingReceipts = readFileSync(receiptPath, {encoding: 'utf-8'});
            if (existingReceipts.trim() === '') {
                receipts = [];
            } else {
                receipts = JSON.parse(existingReceipts);
            }
        }
    } catch (err) {
        console.error('Error reading existing receipts: ', err);
    }
    receipts.push(receipt);
    try {
        writeFileSync(receiptPath, JSON.stringify(receipts, null, 2));
    } catch (err) {
        console.error('Error writing receipts: ', err);
    }
}

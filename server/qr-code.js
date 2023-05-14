import QRCode from "qrcode";
import chalk from 'chalk';

export const generateQRCode = async (txt) => {
    const url = await QRCode.toString(txt, {});
    console.log(chalk.bgBlack.rgb(255, 165, 0)(url));
};

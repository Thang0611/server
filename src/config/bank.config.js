require('dotenv').config();

const bankConfig = {
    BANK_ID: process.env.BANK_ID ,           // MB, VCB, TCB...
    ACCOUNT_NO: process.env.BANK_ACCOUNT_NO ,
    ACCOUNT_NAME: process.env.BANK_ACCOUNT_NAME,
    TEMPLATE: process.env.QR_TEMPLATE ,  // compact, print, qr_only
};

module.exports = bankConfig;
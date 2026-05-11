const { Transaction } = require('@mysten/sui/transactions');
const tx = new Transaction();
console.log(tx.getData().commands);

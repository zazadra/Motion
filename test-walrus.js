const { WalrusClient } = require('@mysten/walrus');
const client = new WalrusClient({ network: 'mainnet' });
const flow = client.writeFilesFlow({ files: [{ content: new Uint8Array([1, 2, 3]), mimeType: 'text/plain' }] });
console.log('flow properties:', Object.keys(flow));

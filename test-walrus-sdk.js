const { WalrusClient, WalrusFile } = require('@mysten/walrus');

async function test() {
  const client = new WalrusClient({ network: 'testnet' });
  const flow = client.writeFilesFlow({
    files: [WalrusFile.from({
      contents: Buffer.from('hello world'),
      identifier: 'test'
    })]
  });

  console.log('Flow before encode:', Object.keys(flow));
  await flow.encode();
  console.log('Flow after encode:', Object.keys(flow));
  console.log('Blob ID:', flow.blobId);
}

test().catch(console.error);

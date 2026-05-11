fetch('https://walrus-mainnet-publisher-1.staketab.org/v1/blobs', { method: 'PUT', body: 'testdata' })
  .then(res => res.text())
  .then(console.log)
  .catch(console.error);

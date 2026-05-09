const { WalrusClient, MAINNET_WALRUS_PACKAGE_CONFIG } = require('@mysten/walrus');
const { SuiJsonRpcClient, getJsonRpcFullnodeUrl } = require('@mysten/sui/jsonRpc');

async function test() {
  try {
    const suiClient = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl('mainnet') });
    const walrusClient = new WalrusClient({
      network: 'mainnet',
      suiClient: suiClient,
      packageConfig: MAINNET_WALRUS_PACKAGE_CONFIG
    });
    console.log("Uploading blob...");
    const bytes = new TextEncoder().encode("Hello Walrus Mainnet from Node.js using packageConfig!");
    const info = await walrusClient.storeBlob(bytes, { epochs: 1 });
    console.log("Success!", info);
  } catch (err) {
    console.error("Error:", err);
  }
}
test();

import { createDAppKit } from '@mysten/dapp-kit-react';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';

function createSuiClient() {
  return new SuiJsonRpcClient({ 
    url: getJsonRpcFullnodeUrl('mainnet'),
    network: 'mainnet',
  });
}

export const dAppKit = createDAppKit({
  networks: ['mainnet'],
  defaultNetwork: 'mainnet',
  createClient: createSuiClient as any, // Cast due to type differences in v2
  slushWalletConfig: { appName: 'Walform — Walrus Feedback Platform' },
});

// Register types for hook type inference
declare module '@mysten/dapp-kit-react' {
  interface Register {
    dAppKit: typeof dAppKit;
  }
}

// Sui dApp Kit v2 — Mainnet
import { createDAppKit } from '@mysten/dapp-kit-react';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';

function createSuiClient(network: string) {
  return new SuiClient({ url: getFullnodeUrl(network as any) });
}

export const dAppKit = createDAppKit({
  networks: ['mainnet'],
  defaultNetwork: 'mainnet',
  createClient: createSuiClient,
  slushWalletConfig: { appName: 'Motion — Walrus Feedback Platform' },
});

// Register types for hook type inference
declare module '@mysten/dapp-kit-react' {
  interface Register {
    dAppKit: typeof dAppKit;
  }
}

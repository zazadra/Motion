// Sui dApp Kit v2 — Mainnet
// Uses CoreClient from @mysten/sui/client
import { createDAppKit } from '@mysten/dapp-kit-react';
import { CoreClient } from '@mysten/sui/client';

function createSuiClient(network: string) {
  const url = `https://fullnode.${network}.sui.io:443`;
  return new CoreClient({ network, url });
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

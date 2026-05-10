import { useCurrentAccount } from '@mysten/dapp-kit-react';

export function useWalletConnection() {
  const account = useCurrentAccount();
  
  return {
    isConnected: !!account,
    account: account,
    address: account?.address || null,
  };
}

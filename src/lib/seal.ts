/**
 * Seal Encryption Stub
 *
 * Seal (https://seal.mystenlabs.com) provides threshold encryption on Sui.
 * This stub is ready to activate when Seal goes mainnet.
 *
 * Current status: DISABLED (Seal is testnet-only as of May 2026)
 */

export const SEAL_AVAILABLE = false;

export interface SealEncryptResult {
  ciphertext: string;  // base64
  policyId: string;    // Sui object ID of the access policy
}

/**
 * Encrypt data with Seal.
 * When SEAL_AVAILABLE=false, returns the data as-is (plaintext passthrough).
 */
export async function encryptData(
  data: string,
  _ownerWallet: string
): Promise<{ encrypted: boolean; payload: string }> {
  if (!SEAL_AVAILABLE) {
    // Passthrough — no encryption until Seal mainnet launches
    return { encrypted: false, payload: data };
  }
  // TODO: Implement when Seal mainnet is available
  // const { SealClient } = await import('@mysten/seal');
  // const client = new SealClient({ network: 'mainnet' });
  // const { ciphertext, policyId } = await client.encrypt(data, { owner: _ownerWallet });
  // return { encrypted: true, payload: JSON.stringify({ ciphertext, policyId }) };
  return { encrypted: false, payload: data };
}

/**
 * Decrypt Seal-encrypted data.
 * When SEAL_AVAILABLE=false, returns the payload as-is.
 */
export async function decryptData(
  payload: string,
  encrypted: boolean,
  _walletAddress: string
): Promise<string> {
  if (!encrypted || !SEAL_AVAILABLE) return payload;
  // TODO: Implement when Seal mainnet is available
  // const { SealClient } = await import('@mysten/seal');
  // const client = new SealClient({ network: 'mainnet' });
  // const { ciphertext, policyId } = JSON.parse(payload);
  // return await client.decrypt(ciphertext, policyId, { wallet: _walletAddress });
  return payload;
}

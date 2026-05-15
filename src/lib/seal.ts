/**
 * Walform E2E Security Seal (Asymmetric Encryption)
 * 
 * Uses Web Crypto API (SubtleCrypto) for secure E2E.
 * 1. Admin generates an RSA Key Pair.
 * 2. Public Key is stored in FormConfig (public).
 * 3. Private Key is encrypted with Admin's Wallet Signature and stored in FormConfig (sealed).
 * 4. Submitter encrypts data with Public Key.
 * 5. Admin decrypts Private Key with their Signature, then decrypts data.
 */

/**
 * Derives a symmetric key from a signature for sealing/unsealing the private key
 */
async function deriveSymmetricKey(signature: string): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(signature));
  return await crypto.subtle.importKey(
    'raw',
    hash,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Generates a new Security Seal (RSA Key Pair)
 * Returns { publicKeyJwk, sealedPrivateKey }
 */
export async function generateSeal(signature: string) {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt']
  );

  const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  const privateKeyStr = JSON.stringify(privateKeyJwk);

  // Seal the private key with the admin's signature
  const masterKey = await deriveSymmetricKey(signature);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encryptedPriv = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    masterKey,
    new TextEncoder().encode(privateKeyStr)
  );

  const sealedPrivateKey = JSON.stringify({
    iv: Buffer.from(iv).toString('base64'),
    ciphertext: Buffer.from(new Uint8Array(encryptedPriv)).toString('base64')
  });

  return { publicKeyJwk, sealedPrivateKey };
}

/**
 * Encrypts data for a form using its Public Key
 */
export async function encryptForSeal(data: string, publicKeyJwk: any): Promise<string> {
  const publicKey = await crypto.subtle.importKey(
    'jwk',
    publicKeyJwk,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  );

  const aesKey = crypto.getRandomValues(new Uint8Array(32));
  const cryptoAesKey = await crypto.subtle.importKey('raw', aesKey, { name: 'AES-GCM' }, false, ['encrypt']);
  
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoAesKey,
    new TextEncoder().encode(data)
  );

  const wrappedKey = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    publicKey,
    aesKey
  );

  return JSON.stringify({
    iv: Buffer.from(iv).toString('base64'),
    ciphertext: Buffer.from(new Uint8Array(ciphertext)).toString('base64'),
    wrappedKey: Buffer.from(new Uint8Array(wrappedKey)).toString('base64')
  });
}

/**
 * Decrypts data using the Admin's Signature to unseal the Private Key
 */
export async function decryptWithSeal(
  encryptedPayload: string,
  sealedPrivateKey: string,
  signature: string
): Promise<string> {
  try {
    const masterKey = await deriveSymmetricKey(signature);
    const { iv: privIv, ciphertext: privCipher } = JSON.parse(sealedPrivateKey);
    const decryptedPriv = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: Buffer.from(privIv, 'base64') },
      masterKey,
      Buffer.from(privCipher, 'base64')
    );
    const privateKeyJwk = JSON.parse(new TextDecoder().decode(decryptedPriv));
    const privateKey = await crypto.subtle.importKey(
      'jwk',
      privateKeyJwk,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['decrypt']
    );

    const { iv, ciphertext, wrappedKey } = JSON.parse(encryptedPayload);
    const aesKey = await crypto.subtle.decrypt(
      { name: 'RSA-OAEP' },
      privateKey,
      Buffer.from(wrappedKey, 'base64')
    );
    const cryptoAesKey = await crypto.subtle.importKey('raw', aesKey, { name: 'AES-GCM' }, false, ['decrypt']);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: Buffer.from(iv, 'base64') },
      cryptoAesKey,
      Buffer.from(ciphertext, 'base64')
    );

    return new TextDecoder().decode(decrypted);
  } catch (err) {
    console.error('[Seal] Secure decryption failed:', err);
    throw new Error('Decryption failed. Ensure you are using the correct admin wallet.');
  }
}

// ---------------------------------------------------------------------------
// LEGACY SYMMETRIC ENCRYPTION (Less secure, kept for backward compat)
// ---------------------------------------------------------------------------

export async function encryptData(data: string, keyStr: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(keyStr));
  const key = await crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(data));
  return JSON.stringify({
    iv: Buffer.from(iv).toString('base64'),
    ciphertext: Buffer.from(new Uint8Array(ciphertext)).toString('base64'),
  });
}

export async function decryptData(encrypted: string, keyStr: string): Promise<string> {
  try {
    const { iv, ciphertext } = JSON.parse(encrypted);
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(keyStr));
    const key = await crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['decrypt']);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: Buffer.from(iv, 'base64') },
      key,
      Buffer.from(ciphertext, 'base64')
    );
    return new TextDecoder().decode(decrypted);
  } catch (err) {
    console.error('[Legacy] Decrypt failed:', err);
    throw new Error('Decryption failed.');
  }
}

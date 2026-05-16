# Walform 🦭

> **Decentralized form & feedback platform built on Sui and Walrus.**  
> Create forms, collect on-chain responses, store media blobs — all signed by user wallets.

[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org)
[![Sui](https://img.shields.io/badge/Sui-Mainnet-4DA2FF?logo=data:image/svg+xml;base64,PHN2Zy8+)](https://sui.io)
[![Walrus](https://img.shields.io/badge/Walrus-Storage-7C3AED)](https://walrus.xyz)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

---

## What is Walform?

Walform lets anyone build and publish decentralized application forms on the **Sui blockchain**. Form configurations and media attachments are stored permanently on **Walrus** (a decentralized blob storage network), while form submissions are anchored on-chain as Sui objects — fully verifiable and immutable.

**Key properties:**
- 🔒 **Wallet-owned** — forms and responses are owned by the submitter's Sui wallet
- 🌐 **Fully on-chain** — no central database; Walrus stores all data permanently
- 📸 **Media uploads** — file attachments uploaded directly from the browser, signed by the user
- 🎨 **Rich form builder** — text, textarea, rating, checkbox, file upload, date picker fields
- 📊 **Admin Dashboard** — view submissions, export data, manage form status
- 🛡️ **Security Seal** — Optional E2E asymmetric encryption (RSA-OAEP) for response data

---

## Architecture

```
User Browser
  ├── Form Builder  →  Walrus (blob: form config JSON)
  │                 →  Sui (object: form reference + blobId)
  │
  └── Form Responder
        ├── Media files  →  writeBlobFlow (wallet-signed)
        │                   register tx: user wallet popup #1
        │                   upload: upload relay (Mainnet)
        │                   certify tx: user wallet popup #2
        │
        └── Submission   →  Sui tx (wallet-signed)
                             stores blobIds + form answers on-chain
```

### Upload Flow (Walrus Mainnet)

All media uploads use the official `@mysten/walrus` SDK with the **upload relay** configuration. The relay requires a WAL tip payment automatically embedded in the register transaction:

```
1. encode   (WASM in browser, no wallet needed)
2. pre-check HEAD /v1/blobs/<blobId>  (3s timeout, skip if already certified)
3. register tx  →  wallet popup #1  (includes WAL relay tip + blob registration)
4. upload   →  upload-relay.mainnet.walrus.space  (relay distributes shards)
5. certify tx  →  wallet popup #2  (anchors blob cert on Sui)
```

> **No server-side signing.** The backend cannot and does not sign Sui transactions.  
> The server handles only indexing, registry, and admin queries.

---

## Security Seal (E2E Encryption)

Walform features an optional **Security Seal** for sensitive data collection. When enabled:

1. **Key Generation**: The admin generates an **RSA-2048** key pair in the browser.
2. **Sealing**: The private key is encrypted (AES-GCM) with the admin's wallet signature and stored in the form configuration on Walrus.
3. **Encryption**: Responses are encrypted in the submitter's browser using the public key before being sent to Sui/Walrus.
4. **Decryption**: Only the admin can unseal the private key (requires a wallet signature) to view the original response data.

*No unencrypted data ever touches the blockchain or storage network when the Seal is active.*

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React 19, TypeScript |
| Styling | Vanilla CSS + Tailwind v4 |
| Animations | Framer Motion |
| Blockchain | Sui Mainnet |
| Blob Storage | Walrus Mainnet (via `@mysten/walrus` SDK) |
| Wallet | `@mysten/dapp-kit` (any Sui wallet) |
| Hosting | Vercel |

---

## Getting Started

### Prerequisites

- Node.js 20+
- A Sui Mainnet wallet (Sui Wallet, OKX, etc.)
- SUI + WAL tokens (for form publishing and media uploads)

### Installation

```bash
git clone https://github.com/zazadra/Walform.git
cd Walform
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Build

```bash
npm run build
npm start
```

---

## Environment

No environment variables are required for the frontend. The app connects directly to:

- **Sui RPC**: `https://fullnode.mainnet.sui.io`
- **Walform Package ID**: `0xebb99d93ce26307c536308339144b05c32c0ac20f04156b61b1805e713a11693`
- **Walrus Upload Relay**: `https://upload-relay.mainnet.walrus.space`
- **Walrus Aggregators**: `https://aggregator.walrus-mainnet.walrus.space` and mirrors

---

## Usage

### Creating a Form

1. Connect your Sui wallet
2. Go to the **Dashboard** and click **New Form**
3. Add fields (text, file upload, rating, checkbox, etc.)
4. Click **Sign & Publish Form** — wallet will prompt twice:
   - Once to store the form config on Walrus
   - Once to create the form object on Sui
5. Share the generated `/f/?formId=0x...` link

### Submitting a Form

1. Open a form link
2. Fill in each step (keyboard-friendly: press `Enter` to advance)
3. If the form has file fields, connect your wallet — uploads are wallet-signed
4. On the final step, click **Submit** — wallet signs the on-chain response

### Admin Dashboard

- Navigate to `/admin` or `/dashboard`
- View all submissions for your forms
- Filter by status, export responses
- See on-chain transaction hashes for each submission

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx          # Landing page
│   ├── f/page.tsx        # Form responder (public)
│   ├── admin/            # Admin dashboard
│   ├── templates/        # Template gallery
│   └── api/
│       └── walrus/       # Deprecated relay (returns 410)
│
├── components/
│   ├── admin/            # Dashboard, FormBuilder, Submissions tabs
│   ├── ui/               # Toast, Skeleton, shared UI
│   ├── Navbar.tsx
│   └── FeedbackCard.tsx
│
├── lib/
│   ├── walrus.ts         # Upload flow (wallet-signed SDK)
│   ├── walrus-providers.ts
│   └── sui.ts            # Sui client helpers
│
└── types/
    └── walform.ts        # Shared TypeScript types
```

---

## Token Requirements

| Action | Cost |
|--------|------|
| Publish form | ~0.01 SUI (gas) + WAL for Walrus storage |
| Upload media | ~0.01 SUI (gas) + WAL tip (≤ 0.1 WAL) + WAL for blob storage |
| Submit response | ~0.005 SUI (gas) |

Storage duration defaults to **1 epoch** (~1 week). Adjust `epochs` in `walrus.ts` for longer storage.

---

## Contributing

Pull requests welcome. For major changes, open an issue first to discuss.

---

## License

MIT © [zazadra](https://github.com/zazadra)

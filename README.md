# SIGIL

**Zcash-inspired burn-to-certificate launchpad on Robinhood Chain.**

STAMP gave you paper. SIGIL gives you paper that pays rent.

## What this is

A launchpad where users burn tokens on any chain (Solana / Ethereum / Base / BSC), get:

1. **A Zcash inscription** (permanent proof, ZIP-227 aligned for future ZSA migration)
2. **An ERC-721 certificate NFT on Robinhood Chain** (stakeable, yields fees from launchpad activity)

Certificates start paying weth dividends day 1. When ZSA ships, they upgrade to real shielded assets. Team can't rug — conversion logic is on-chain.

## Repo Structure

```
sigil/
├── contracts/    # Foundry / Solidity contracts (Robinhood Chain)
├── relayer/      # Node.js Zcash inscription writer
├── backend/      # Indexer + API (PostgreSQL + Hono)
├── frontend/     # Next.js 14 App Router
└── README.md
```

## Quick Start

```bash
# 1. Contracts
cd contracts
forge install
forge build
forge test

# 2. Backend
cd ../backend
npm install
cp env.example .env  # fill in your RPC URLs + DB
npm run migrate
npm run dev

# 3. Relayer
cd ../relayer
npm install
cp env.example .env  # fill in Zcash wallet seed
npm run dev

# 4. Frontend
cd ../frontend
npm install
cp env.example .env.local
npm run dev
```

Open http://localhost:3000

## Architecture

```
                                          [Zcash mainnet]
                                          Zcash inscription (ZIP-227 aligned)
                                                     ▲
                                                     │ 3. Relayer writes
                                                     │    inscription
                                                     │
[Any source chain]         [Robinhood Chain]         │
Burn any token   ─────────► BurnRegistry.sol  ──────►│
(Sol/Eth/Base/BSC)         │                         │
                           ▼                         │
                    SigilCertificate.sol  ───────────┘
                    (ERC-721, mint on burn)
                           │
                           ▼ stake
                    RewardVault.sol
                    (fee share: weth/USDG)
                           ▲
                           │
                    SigilLaunchpad.sol  (Pons V2 fork)
                    every trade fee → 70% to vault
```

## Contracts (Robinhood Chain)

- `BurnRegistry.sol` — receives cross-chain burn proofs, mints certificates
- `SigilCertificate.sol` — ERC-721 with ZIP-227 aligned metadata
- `SigilLaunchpad.sol` — Pons V2 fork with fee routing to RewardVault
- `RewardVault.sol` — stake certificates, earn fee dividends

## Relayer

Watches `BurnRegistry.BurnAccepted` events → writes matching inscription to Zcash mainnet via lightwalletd.

## Backend

Indexes burn events across all supported chains, computes certificate rarity, exposes REST API.

## Frontend

- `/` — landing (explain what SIGIL is)
- `/burn` — submit cross-chain burn
- `/certificates` — your NFT certificates
- `/vault` — stake for weth dividends
- `/leaderboard` — top burners / rarest certificates

## Deployment Targets

- **Contracts**: Robinhood Chain (chain id 4663)
- **Relayer**: any VPS with lightwalletd access
- **Backend**: Railway / Render
- **Frontend**: Vercel

## License

MIT (see individual package licenses)

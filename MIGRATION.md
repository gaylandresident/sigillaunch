# ZSA Migration Path

SIGIL was designed from day one so that **every certificate and every launched
token can atomically migrate to real Zcash Shielded Assets (ZSA)** the moment
`OrchardZSA` activates on Zcash mainnet (ZIP-226 + ZIP-227).

Nothing about that migration depends on our team surviving, our infrastructure
staying up, or the community trusting us. The migration payload is stored
on-chain in a form that any independent party can replay.

## What's on-chain today

Every burn certificate stores a canonical **ZIP-227 IssueBundle**:

| Field | What it is | Where stored |
| --- | --- | --- |
| `zsaAssetBase`   | 32-byte canonical asset base derived from `BLAKE2b("ZSA-AssetBaseG", descHash)` | `SigilCertificate.burns[tokenId].zsaBundle` |
| `zsaDescHash`    | 32-byte description hash `BLAKE2b("ZSA-DescCRH", issuer‖desc)` | ↑ |
| `zsaIssuer`      | 33 bytes = `0x00 ‖ x-only BIP-340 pubkey` | ↑ |
| `zsaAuthSig`     | 64-byte BIP-340 Schnorr signature over the finalized bundle SIGHASH | ↑ |

Every launched token stores the same four fields in
`SigilLaunchpad.launches[launchId]`.

All hashes are **real BLAKE2b**, all signatures are **real BIP-340** — matching
the ZSA mainnet spec exactly, not the SHA-256 mocks used by other POCs.

## How migration works when ZSA ships

1. Anyone runs a `migrator` script (see `migrator/` for a stub).
2. Script iterates:
   - Every `SigilCertificate` token id → reads its `IssueBundle`.
   - Every `SigilLaunchpad` launch id → reads its four ZSA fields.
3. For each, script builds a real OrchardZSA `IssueAction` transaction that
   references the pre-computed asset base and includes the pre-signed
   `IssueAuthSig`.
4. Broadcast to Zcash mainnet. Because signatures already exist, the migrator
   does **not** need access to the issuer key — anybody can broadcast.
5. Zcash mainnet mints the shielded asset to the recipient's Zcash address.
   - For certificates: the recipient is chosen when the user claims the cert
     (stored in `SigilCertificate.burns[tokenId].burner`).
   - For launched tokens: the recipient is the current on-chain holder at
     migration snapshot time — a standard airdrop against balances.

## Why this is trust-minimized

- **We can't rug the migration.** The IssueAuthSig is signed today and
  immutable. Even if we vanish, anyone with the on-chain data can migrate.
- **We can't front-run the migration.** The signature commits to a specific
  asset base and finalize flag; we can't reissue the same asset with different
  parameters later.
- **We can't lie about the mapping.** Descriptions are deterministic
  (`sigil:cert:v1:{chain}:{token}:{tx}` and `sigil:launch:v1:robinhood:{creator}:{name}:{symbol}:{ms}`)
  so anyone can reproduce the asset base from public inputs.

## Issuer key custody

The one thing we DO custody is the ZIP-32 hardened derivation key
`m/227'/133'/0'/0` that produces every certificate's issuer. This is a single
BIP-39 mnemonic held server-side in the backend's `ZSA_ISSUER_MNEMONIC` env.

If we ever lose that key:
- **Historical certificates still migrate** — their bundles are already signed.
- **New certificates can't migrate** until a new key is used.

Best practice: rotate the mnemonic annually and finalize old assets before
retiring their key. Zcash's `finalize=true` flag is set on every bundle so
supply is locked at issuance and can never be inflated.

## Contract references

- `contracts/src/interfaces/IZip227.sol` — the on-chain struct shape
- `contracts/src/SigilCertificate.sol` — stores the bundle per certificate
- `contracts/src/SigilLaunchpad.sol` — stores the bundle per launch
- `contracts/src/BurnRegistry.sol` — accepts bundles at claim time

## Backend references

- `backend/src/zsa/keys.ts`    — BIP-32 → BIP-340 issuer key derivation
- `backend/src/zsa/hash.ts`    — real BLAKE2b with correct personalization
- `backend/src/zsa/sign.ts`    — real BIP-340 Schnorr sign + verify
- `backend/src/zsa/bundle.ts`  — canonical bundle assembly + JSON encoding
- `backend/src/api/attest.ts`  — signs one bundle per verified burn
- `backend/src/api/prepare-launch.ts` — signs one bundle per token launch

## Migrator stub

See `migrator/README.md` for the algorithm and interface any implementation
must follow. A reference Rust implementation using `zcash_client_backend` will
land once ZSA testnet APIs stabilize.

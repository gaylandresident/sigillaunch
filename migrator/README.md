# SIGIL → ZSA Migrator (stub)

When Zcash mainnet activates OrchardZSA (ZIP-226 + ZIP-227), any independent
party can migrate SIGIL certificates and launched tokens to real shielded
custom assets by running this migrator.

## Algorithm

```
for chunk in paginate(SigilCertificate.tokenByIndex, 100):
    for tokenId in chunk:
        rec = SigilCertificate.getBurnRecord(tokenId)
        recipient_zaddr = lookup_zcash_address(rec.burner)  // out-of-band
        tx = build_orchardzsa_issue_tx(
            issuer         = rec.zsaBundle.issuer,
            asset_desc_hash= rec.zsaBundle.actions[0].assetDescHash,
            amount         = rec.zsaBundle.actions[0].amount,
            finalize       = true,
            issueAuthSig   = rec.zsaBundle.issueAuthSig,
            recipient      = recipient_zaddr,
        )
        broadcast(tx, zcash_mainnet)

for launchId in SigilLaunchpad.paginatedLaunches(0, 500):
    l = SigilLaunchpad.launches[launchId]
    snapshot = enumerate_holders(l.token)     // snapshot at cutoff block
    for holder, balance in snapshot:
        recipient_zaddr = lookup_zcash_address(holder)
        tx = build_orchardzsa_issue_tx(
            issuer         = l.zsaIssuer,
            asset_desc_hash= l.zsaDescHash,
            amount         = balance,
            finalize       = false,          // supply proportional to holder
            issueAuthSig   = ...,             // needs live issuer key OR pre-signed per-holder bundle
            recipient      = recipient_zaddr,
        )
        broadcast(tx, zcash_mainnet)
```

## Key facts

1. **Certificate migration is fully permissionless**: bundle is pre-signed,
   anyone can broadcast without the issuer key.
2. **Launch migration requires either**:
   - The live issuer key to sign per-holder issue actions at migration time, or
   - A pre-computed per-holder bundle snapshot signed at some cutoff block.
3. **Address mapping**: users must register a Zcash z-address ahead of time
   (planned `/api/zcash-address` endpoint). Otherwise migrated tokens sit in
   an escrow contract until they claim.

## Reference libraries

- Rust: [`zcash_client_backend`](https://github.com/zcash/librustzcash/tree/main/zcash_client_backend)
  provides `OrchardZSA` transaction builders and BIP-340 Schnorr verification.
- Node.js: [`@noble/curves`](https://github.com/paulmillr/noble-curves) provides
  BIP-340 Schnorr; there is no mature JS OrchardZSA tx builder yet.

## Status

- ✅ On-chain bundle format is finalized and stored in every certificate/launch
- ✅ Bundle uses real BLAKE2b + real BIP-340 (not ZcashMEME-style mocks)
- ⏳ Reference Rust implementation blocked on ZSA mainnet APIs
- ⏳ Zcash address registry endpoint blocked on ZSA activation timeline

The point is: **the on-chain data is ready. The migrator is a data-processing
script, not a trust root.** When ZSA lands, anyone can write it.

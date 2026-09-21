// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IZip227 - ZIP-227 aligned asset metadata for future ZSA migration
/// @notice When ZSA activates on Zcash mainnet, certificates recording this
///         metadata can be atomically migrated 1:1 into shielded custom assets.
/// @dev See https://zips.z.cash/zip-0227
interface IZip227 {
    /// @notice ZIP-227 IssueAction — records issuance of a Zcash custom asset
    struct IssueAction {
        bytes32 assetDescHash; // blake2b("ZSA-DescCRH" || issuer || description)
        uint256 amount;
        bool finalize;
    }

    /// @notice ZIP-227 IssueBundle — full bundle stored for each certificate
    struct IssueBundle {
        bytes issuer;          // 0x00 || BIP-340 x-coordinate (33 bytes)
        IssueAction[] actions;
        bytes issueAuthSig;    // BIP-340 Schnorr signature over sigHash
    }

    /// @notice Derive the canonical ZIP-227 asset base from an issuer + description
    function deriveAssetBase(bytes calldata issuer, bytes32 descHash)
        external
        pure
        returns (bytes32 assetBase);
}

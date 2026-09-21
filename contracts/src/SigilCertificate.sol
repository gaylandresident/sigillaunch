// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IZip227} from "./interfaces/IZip227.sol";

/// @title SigilCertificate
/// @notice ERC-721 receipt for cross-chain burns. Each certificate is a permanent record
///         of a burn on some source chain, plus ZIP-227 aligned metadata so it can be
///         atomically migrated to a Zcash Shielded Asset when ZSA activates.
contract SigilCertificate is ERC721Enumerable, Ownable {
    // ---------- Types ----------

    enum SourceChain {
        SOLANA,
        ETHEREUM,
        BASE,
        BSC,
        ARBITRUM,
        PROTOCOL,   // self-burn by DividendRouter — funded by fee buybacks, auto-staked
        ROBINHOOD   // burns done natively on Robinhood Chain (same-chain, cheapest)
    }

    enum Rarity {
        COMMON,     // < $100
        RARE,       // $100 - $1,000
        EPIC,       // $1,000 - $10,000 OR top 100 early per chain
        LEGENDARY   // > $10,000 OR first stamp per chain
    }

    struct BurnRecord {
        SourceChain sourceChain;
        address sourceToken;      // 20 bytes (EVM); for Solana, first 20 bytes of mint pubkey
        address burner;           // Robinhood Chain address that owns the certificate
        uint256 amount;           // raw token units
        uint256 usdValueAtBurn;   // scaled 1e8 (Chainlink convention)
        uint256 burnBlock;        // source chain block number
        bytes32 burnTxHash;       // source chain tx hash
        uint64 burnedAt;          // unix timestamp
        Rarity rarity;
        IZip227.IssueBundle zsaBundle; // pre-computed ZIP-227 bundle
    }

    // ---------- Storage ----------

    address public burnRegistry;
    uint256 public nextTokenId;
    string public baseImageURI;

    mapping(uint256 tokenId => BurnRecord) public burns;
    mapping(SourceChain => uint256) public firstStampByChain;
    mapping(SourceChain => uint256) public stampCountByChain;

    // ---------- Events ----------

    event CertificateMinted(
        uint256 indexed tokenId,
        address indexed burner,
        SourceChain sourceChain,
        Rarity rarity,
        uint256 usdValueAtBurn
    );
    event BurnRegistryUpdated(address indexed newRegistry);
    event BaseImageURIUpdated(string newURI);

    // ---------- Errors ----------

    error OnlyBurnRegistry();
    error TokenDoesNotExist();

    // ---------- Constructor ----------

    constructor(address _owner, string memory _baseImageURI)
        ERC721("SIGIL Certificate", "SIGIL")
        Ownable(_owner)
    {
        baseImageURI = _baseImageURI;
        nextTokenId = 1;
    }

    // ---------- Admin ----------

    function setBurnRegistry(address _burnRegistry) external onlyOwner {
        burnRegistry = _burnRegistry;
        emit BurnRegistryUpdated(_burnRegistry);
    }

    function setBaseImageURI(string calldata _uri) external onlyOwner {
        baseImageURI = _uri;
        emit BaseImageURIUpdated(_uri);
    }

    // ---------- Minting (called by BurnRegistry only) ----------

    function mintFromBurn(
        address to,
        SourceChain sourceChain,
        address sourceToken,
        uint256 amount,
        uint256 usdValueAtBurn,
        uint256 burnBlock,
        bytes32 burnTxHash,
        IZip227.IssueBundle calldata zsaBundle
    ) external returns (uint256 tokenId) {
        if (msg.sender != burnRegistry) revert OnlyBurnRegistry();

        tokenId = nextTokenId++;

        Rarity rarity = _calcRarity(usdValueAtBurn, sourceChain);

        burns[tokenId] = BurnRecord({
            sourceChain: sourceChain,
            sourceToken: sourceToken,
            burner: to,
            amount: amount,
            usdValueAtBurn: usdValueAtBurn,
            burnBlock: burnBlock,
            burnTxHash: burnTxHash,
            burnedAt: uint64(block.timestamp),
            rarity: rarity,
            zsaBundle: zsaBundle
        });

        if (firstStampByChain[sourceChain] == 0) {
            firstStampByChain[sourceChain] = tokenId;
        }
        stampCountByChain[sourceChain]++;

        _safeMint(to, tokenId);

        emit CertificateMinted(tokenId, to, sourceChain, rarity, usdValueAtBurn);
    }

    // ---------- Views ----------

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        if (_ownerOf(tokenId) == address(0)) revert TokenDoesNotExist();
        // Off-chain resolver reads baseImageURI + tokenId, composes SVG stamp from burns[tokenId]
        return string.concat(baseImageURI, "/", _toString(tokenId), ".json");
    }

    function getBurnRecord(uint256 tokenId) external view returns (BurnRecord memory) {
        if (_ownerOf(tokenId) == address(0)) revert TokenDoesNotExist();
        return burns[tokenId];
    }

    // ---------- Internals ----------

    function _calcRarity(uint256 usdValueAtBurn, SourceChain chain) internal view returns (Rarity) {
        // First-of-chain always legendary
        if (firstStampByChain[chain] == 0) return Rarity.LEGENDARY;

        // Value-based tiers (usdValueAtBurn scaled 1e8)
        if (usdValueAtBurn >= 10_000e8) return Rarity.LEGENDARY;
        if (usdValueAtBurn >= 1_000e8) return Rarity.EPIC;
        if (usdValueAtBurn >= 100e8) return Rarity.RARE;
        return Rarity.COMMON;
    }

    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) { digits++; temp /= 10; }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}

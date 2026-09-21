// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {SigilCertificate} from "./SigilCertificate.sol";
import {IZip227} from "./interfaces/IZip227.sol";

/// @title BurnRegistry
/// @notice Accepts cross-chain burn proofs and mints SigilCertificate NFTs.
///         Two verification modes:
///           1. Attested mode (MVP): backend signer verifies burn off-chain, signs
///              a claim that the contract verifies with ECDSA.
///           2. Trustless mode (v2): LayerZero read / light-client proof.
///         Also emits BurnAccepted event which the Zcash relayer listens on to
///         write the corresponding inscription to Zcash mainnet.
contract BurnRegistry is Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // ---------- Storage ----------

    SigilCertificate public immutable certificate;
    address public attester;                   // trusted signer for MVP attested mode
    address public dividendRouter;             // allowed to call protocolBurn
    mapping(bytes32 => bool) public claimed;   // burnTxHash => already claimed
    uint256 public feeInWei;                   // small fee to cover Zcash relayer ZEC gas + margin

    // ---------- Events ----------

    /// @notice Emitted every time a burn is accepted and certificate minted.
    ///         Zcash relayer listens for this and writes matching inscription.
    event BurnAccepted(
        uint256 indexed tokenId,
        address indexed burner,
        SigilCertificate.SourceChain sourceChain,
        bytes32 burnTxHash,
        uint256 amount,
        uint256 usdValueAtBurn,
        bytes zsaBundle
    );

    event AttesterUpdated(address indexed newAttester);
    event DividendRouterUpdated(address indexed newRouter);
    event FeeUpdated(uint256 newFeeInWei);
    event ProtocolBurnCompleted(uint256 indexed tokenId, uint256 sigilAmount, uint256 usdBacking);

    // ---------- Errors ----------

    error AlreadyClaimed();
    error BadSignature();
    error InsufficientFee();
    error OnlyDividendRouter();

    // ---------- Constructor ----------

    constructor(address _owner, SigilCertificate _certificate, address _attester, uint256 _feeInWei)
        Ownable(_owner)
    {
        certificate = _certificate;
        attester = _attester;
        feeInWei = _feeInWei;
    }

    // ---------- Admin ----------

    function setAttester(address _attester) external onlyOwner {
        attester = _attester;
        emit AttesterUpdated(_attester);
    }

    function setDividendRouter(address _router) external onlyOwner {
        dividendRouter = _router;
        emit DividendRouterUpdated(_router);
    }

    function setFee(uint256 _feeInWei) external onlyOwner {
        feeInWei = _feeInWei;
        emit FeeUpdated(_feeInWei);
    }

    function sweep(address to) external onlyOwner {
        (bool ok,) = to.call{value: address(this).balance}("");
        require(ok, "sweep failed");
    }

    // ---------- Attested Claim (MVP) ----------

    /// @notice Submit a burn claim with backend attestation. The certificate NFT
    ///         is minted to `recipient`, which may differ from `msg.sender`.
    ///         (Anyone can pay gas to mint into any recipient that has a valid
    ///          attestation — needed for the "create embedded wallet" flow where
    ///          the recipient has no ETH.)
    function claim(
        address recipient,
        SigilCertificate.SourceChain sourceChain,
        address sourceToken,
        uint256 amount,
        uint256 usdValueAtBurn,
        uint256 burnBlock,
        bytes32 burnTxHash,
        IZip227.IssueBundle calldata zsaBundle,
        bytes calldata attestation
    ) external payable returns (uint256 tokenId) {
        if (msg.value < feeInWei) revert InsufficientFee();
        if (claimed[burnTxHash]) revert AlreadyClaimed();

        // Reconstruct signed message — binds recipient (not msg.sender)
        bytes32 digest = keccak256(
            abi.encode(
                block.chainid,
                address(this),
                recipient,
                sourceChain,
                sourceToken,
                amount,
                usdValueAtBurn,
                burnBlock,
                burnTxHash
            )
        ).toEthSignedMessageHash();

        address recovered = digest.recover(attestation);
        if (recovered != attester) revert BadSignature();

        claimed[burnTxHash] = true;

        tokenId = certificate.mintFromBurn(
            recipient,
            sourceChain,
            sourceToken,
            amount,
            usdValueAtBurn,
            burnBlock,
            burnTxHash,
            zsaBundle
        );

        emit BurnAccepted(
            tokenId,
            recipient,
            sourceChain,
            burnTxHash,
            amount,
            usdValueAtBurn,
            abi.encode(zsaBundle)
        );
    }

    // ---------- Protocol Self-Burn (DividendRouter flywheel) ----------

    /// @notice Called by DividendRouter after buying back $SIGIL with platform fees.
    ///         Mints a new SIGIL certificate NFT of source=PROTOCOL to the router,
    ///         which will then auto-stake it in RewardVault. This is the recycling
    ///         mechanism that keeps the flywheel spinning: bought-back SIGIL becomes
    ///         a permanent yield-generating certificate for the protocol treasury.
    /// @param sigilAmount how much SIGIL was bought back (routed to burn pathway)
    /// @param usdBacking weth spent on the buyback, scaled 1e8 for rarity calc
    /// @return tokenId newly minted certificate id owned by the router
    function protocolBurn(uint256 sigilAmount, uint256 usdBacking)
        external
        returns (uint256 tokenId)
    {
        if (msg.sender != dividendRouter) revert OnlyDividendRouter();

        // Synthetic uniqueness — no external tx hash to consume
        bytes32 syntheticTxHash = keccak256(
            abi.encode("SIGIL-PROTOCOL", block.number, sigilAmount, address(this))
        );

        // Empty ZSA bundle placeholder — router-owned protocol NFTs represent
        // treasury value, not user-facing burns; no ZSA issuer is bound to them.
        IZip227.IssueBundle memory bundle;

        tokenId = certificate.mintFromBurn(
            msg.sender,
            SigilCertificate.SourceChain.PROTOCOL,
            address(this),      // "source token" placeholder — the registry itself
            sigilAmount,
            usdBacking,
            block.number,
            syntheticTxHash,
            bundle
        );

        emit ProtocolBurnCompleted(tokenId, sigilAmount, usdBacking);
    }

    receive() external payable {}
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IWETH is IERC20 {
    function deposit() external payable;
    function withdraw(uint256) external;
}

/// @title SigilLaunchpad — permissionless bonding-curve token launcher on Robinhood Chain
///
/// @notice Pons V2-style constant-product bonding curve. Every launch:
///           - is a fixed 1B ERC-20 minted entirely to its own curve
///           - trades against native ETH (auto-wrapped WETH internally)
///           - charges 1% fee on every trade, split:
///               70% → DividendRouter (fuels the flywheel)
///               30% → launch creator (keeps you honest as builder)
///
/// @dev Design goal: cleanest possible Pons alternative. No graduation, no V4
///      migration, no snipe tax (yet). All trades happen in the same curve
///      forever — simple to reason about, cheap to deploy.
contract SigilLaunchpad is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------- Constants ----------

    uint256 public constant SUPPLY = 1_000_000_000e18;
    uint256 public constant FEE_BPS = 100;              // 1% trade fee (Pons std)
    uint256 public constant CREATOR_SHARE_BPS = 3000;   // 30% of fee → creator
    uint256 public constant PROTOCOL_SHARE_BPS = 7000;  // 70% of fee → DividendRouter
    uint256 public constant BPS_DENOM = 10_000;

    /// @notice Snipe tax mirrors Pons V2 — 99% fee on trades in the first 3 seconds
    ///         after launch. Prevents MEV bots front-running fair launches.
    uint256 public constant SNIPE_WINDOW = 3 seconds;
    uint256 public constant SNIPE_TAX_BPS = 9900;       // 99%

    /// @notice Curve graduates once cumulative real WETH raised hits this threshold
    ///         (mirrors Pons V2's 4.2 ETH graduation target). Post-graduation trading
    ///         continues on the same curve; a future upgrade migrates to Uniswap V4.
    uint256 public constant GRADUATION_THRESHOLD = 4.2 ether;

    IWETH public immutable weth;
    address public dividendRouter;

    // ---------- Types ----------

    struct Launch {
        address token;
        address creator;
        uint256 tokenReserve;
        uint256 wethReserve;
        uint256 k;
        uint64 createdAt;
        string metadataURI;    // IPFS/Arweave URI for name/logo/desc
        // ZIP-227 fields — every launched token is ZSA-migration ready
        bytes32 zsaAssetBase;  // canonical derived from issuer + description
        bytes32 zsaDescHash;   // BLAKE2b("ZSA-DescCRH" || issuer || descBytes)
        bytes zsaIssuer;       // 33-byte 0x00 || x-only pubkey
        bytes zsaAuthSig;      // 64-byte BIP-340 Schnorr sig over finalized bundle
    }

    mapping(bytes32 launchId => Launch) public launches;
    mapping(bytes32 launchId => uint256) public wethRaised;   // real ETH raised, for graduation
    mapping(bytes32 launchId => bool) public graduated;
    bytes32[] public allLaunchIds;
    uint256 public launchFee = 0.0005 ether; // Pons V2 standard

    // ---------- Events ----------

    event LaunchCreated(
        bytes32 indexed launchId,
        address indexed token,
        address indexed creator,
        string name,
        string symbol,
        uint256 phantomWeth,
        string metadataURI
    );
    /// @notice Emitted alongside LaunchCreated when a ZIP-227 bundle is bound.
    ///         The Zcash relayer listens for this and writes a matching inscription
    ///         on Zcash mainnet, making the token migration-ready when ZSA activates.
    event LaunchZsaBound(
        bytes32 indexed launchId,
        bytes32 assetBase,
        bytes32 descHash,
        bytes issuer,
        bytes authSig
    );
    event Traded(
        bytes32 indexed launchId,
        address indexed trader,
        bool isBuy,
        uint256 wethAmount,
        uint256 tokenAmount,
        uint256 fee
    );
    event Graduated(bytes32 indexed launchId, uint256 wethRaised);
    event DividendRouterUpdated(address indexed newRouter);
    event LaunchFeeUpdated(uint256 newFee);

    // ---------- Errors ----------

    error LaunchExists();
    error UnknownLaunch();
    error SlippageExceeded();
    error ZeroAmount();
    error InsufficientLaunchFee();

    // ---------- Constructor ----------

    constructor(address _owner, IWETH _weth, address _dividendRouter) Ownable(_owner) {
        weth = _weth;
        dividendRouter = _dividendRouter;
    }

    // ---------- Admin ----------

    function setDividendRouter(address _router) external onlyOwner {
        dividendRouter = _router;
        emit DividendRouterUpdated(_router);
    }

    function setLaunchFee(uint256 _fee) external onlyOwner {
        launchFee = _fee;
        emit LaunchFeeUpdated(_fee);
    }

    function sweep(address to) external onlyOwner {
        (bool ok, ) = to.call{value: address(this).balance}("");
        require(ok, "sweep");
    }

    // ---------- Launch ----------

    /// @notice Deploy a new bonding-curve token bound to a ZIP-227 issuance bundle.
    /// @dev The ZIP-227 bundle is pre-computed by the SIGIL backend using the
    ///      canonical issuer key (m/227'/133'/0'/N). Frontend fetches it from
    ///      /prepare-launch and passes it here. Storing it on-chain means the
    ///      token has migration parity with certificates the moment ZSA activates.
    /// @param phantomWethReserve virtual WETH reserve setting the opening price
    /// @param zsaAssetBase   32-byte canonical asset base (BLAKE2b of descHash)
    /// @param zsaDescHash    32-byte description hash (BLAKE2b of issuer||descBytes)
    /// @param zsaIssuer      33-byte issuer (0x00 || x-only pubkey), BIP-340
    /// @param zsaAuthSig     64-byte Schnorr signature over the finalized issuance bundle
    function createLaunch(
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,
        uint256 phantomWethReserve,
        bytes32 zsaAssetBase,
        bytes32 zsaDescHash,
        bytes calldata zsaIssuer,
        bytes calldata zsaAuthSig
    ) external payable returns (bytes32 launchId, address token) {
        if (msg.value < launchFee) revert InsufficientLaunchFee();

        SigilLaunchToken lt = new SigilLaunchToken(name, symbol, SUPPLY);
        token = address(lt);
        launchId = keccak256(abi.encode(token, block.chainid));
        if (launches[launchId].token != address(0)) revert LaunchExists();

        launches[launchId] = Launch({
            token: token,
            creator: msg.sender,
            tokenReserve: SUPPLY,
            wethReserve: phantomWethReserve,
            k: SUPPLY * phantomWethReserve,
            createdAt: uint64(block.timestamp),
            metadataURI: metadataURI,
            zsaAssetBase: zsaAssetBase,
            zsaDescHash: zsaDescHash,
            zsaIssuer: zsaIssuer,
            zsaAuthSig: zsaAuthSig
        });
        allLaunchIds.push(launchId);

        if (msg.value > 0) {
            weth.deposit{value: msg.value}();
            weth.transfer(dividendRouter, msg.value);
        }

        emit LaunchCreated(launchId, token, msg.sender, name, symbol, phantomWethReserve, metadataURI);
        if (zsaAssetBase != bytes32(0)) {
            emit LaunchZsaBound(launchId, zsaAssetBase, zsaDescHash, zsaIssuer, zsaAuthSig);
        }
    }

    // ---------- Trade ----------

    /// @notice Buy launch tokens with ETH (auto-wrapped). Snipe-tax'd in first 3s.
    function buy(bytes32 launchId, uint256 minTokenOut) external payable nonReentrant returns (uint256 tokenOut) {
        Launch storage l = launches[launchId];
        if (l.token == address(0)) revert UnknownLaunch();
        if (msg.value == 0) revert ZeroAmount();

        weth.deposit{value: msg.value}();

        uint256 feeBps = _currentFeeBps(l.createdAt);
        uint256 fee = (msg.value * feeBps) / BPS_DENOM;
        _routeFee(l.creator, fee);

        uint256 wethNet = msg.value - fee;
        uint256 newWeth = l.wethReserve + wethNet;
        uint256 newToken = l.k / newWeth;
        tokenOut = l.tokenReserve - newToken;
        if (tokenOut < minTokenOut) revert SlippageExceeded();

        l.wethReserve = newWeth;
        l.tokenReserve = newToken;
        wethRaised[launchId] += wethNet;
        _maybeGraduate(launchId);

        IERC20(l.token).safeTransfer(msg.sender, tokenOut);
        emit Traded(launchId, msg.sender, true, msg.value, tokenOut, fee);
    }

    /// @notice Sell launch tokens for ETH.
    function sell(bytes32 launchId, uint256 tokenIn, uint256 minEthOut) external nonReentrant returns (uint256 ethOut) {
        Launch storage l = launches[launchId];
        if (l.token == address(0)) revert UnknownLaunch();
        if (tokenIn == 0) revert ZeroAmount();

        IERC20(l.token).safeTransferFrom(msg.sender, address(this), tokenIn);

        uint256 newToken = l.tokenReserve + tokenIn;
        uint256 newWeth = l.k / newToken;
        uint256 wethGross = l.wethReserve - newWeth;

        uint256 feeBps = _currentFeeBps(l.createdAt);
        uint256 fee = (wethGross * feeBps) / BPS_DENOM;
        _routeFee(l.creator, fee);

        ethOut = wethGross - fee;
        if (ethOut < minEthOut) revert SlippageExceeded();

        l.tokenReserve = newToken;
        l.wethReserve = newWeth;

        weth.withdraw(ethOut);
        (bool ok, ) = msg.sender.call{value: ethOut}("");
        require(ok, "eth send");
        emit Traded(launchId, msg.sender, false, ethOut, tokenIn, fee);
    }

    // ---------- Internals ----------

    function _currentFeeBps(uint64 createdAt) internal view returns (uint256) {
        if (block.timestamp < uint256(createdAt) + SNIPE_WINDOW) return SNIPE_TAX_BPS;
        return FEE_BPS;
    }

    function _maybeGraduate(bytes32 launchId) internal {
        if (graduated[launchId]) return;
        if (wethRaised[launchId] >= GRADUATION_THRESHOLD) {
            graduated[launchId] = true;
            emit Graduated(launchId, wethRaised[launchId]);
        }
    }

    // ---------- Views ----------

    function launchCount() external view returns (uint256) {
        return allLaunchIds.length;
    }

    function priceWeth(bytes32 launchId) external view returns (uint256) {
        Launch memory l = launches[launchId];
        if (l.token == address(0)) revert UnknownLaunch();
        return (l.wethReserve * 1e18) / l.tokenReserve;
    }

    function paginatedLaunches(uint256 offset, uint256 limit) external view returns (bytes32[] memory ids) {
        uint256 n = allLaunchIds.length;
        if (offset >= n) return new bytes32[](0);
        uint256 end = offset + limit > n ? n : offset + limit;
        ids = new bytes32[](end - offset);
        for (uint256 i = 0; i < ids.length; i++) ids[i] = allLaunchIds[offset + i];
    }

    // ---------- Internals ----------

    function _routeFee(address creator, uint256 fee) internal {
        if (fee == 0) return;
        uint256 toCreator = (fee * CREATOR_SHARE_BPS) / BPS_DENOM;
        uint256 toRouter = fee - toCreator;
        if (toCreator > 0) weth.transfer(creator, toCreator);
        if (toRouter > 0) weth.transfer(dividendRouter, toRouter);
    }

    receive() external payable {}
}

/// @dev Fixed-supply ERC-20 minted to the launchpad at creation.
contract SigilLaunchToken is ERC20 {
    constructor(string memory name, string memory symbol, uint256 supply) ERC20(name, symbol) {
        _mint(msg.sender, supply);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {RewardVault} from "./RewardVault.sol";
import {BurnRegistry} from "./BurnRegistry.sol";
import {SigilCertificate} from "./SigilCertificate.sol";
import {ISwapRouter} from "./interfaces/ISwapRouter.sol";

/// @title DividendRouter — the SIGIL self-compounding flywheel
///
/// @notice Receives 100% of platform fees (in weth) from Pons trades of $SIGIL.
///         Every `flush()` call (invoked every 10 min by the off-chain distributor):
///
///           STEP 0. Harvest weth dividends earned by protocol-owned certificates
///                   (previous flushes' NFTs still earn from the vault)
///           STEP 1. Split the accumulated weth 50 / 50 between buyback and dividend
///           STEP 2. BUY BACK $SIGIL from the Pons pool with 50% of weth
///           STEP 3. Burn the bought-back $SIGIL via BurnRegistry.protocolBurn()
///                   — this mints a NEW protocol-owned SIGIL certificate NFT
///                   — router auto-stakes it in the RewardVault
///                   — supply of SIGIL falls, protocol-owned share of vault grows
///           STEP 4. Deposit remaining 50% weth into RewardVault as dividend
///                   — all stakers (user + protocol) earn pro-rata
///
///         Because protocol NFTs earn dividend that returns to this contract on
///         the NEXT flush, the flywheel compounds indefinitely. Every trade:
///           - burns SIGIL supply (deflationary)
///           - grows protocol NFT stake (permanent-yield accumulation)
///           - pays real cash flow to certificate stakers
contract DividendRouter is Ownable, ReentrancyGuard, IERC721Receiver {
    using SafeERC20 for IERC20;

    // ---------- Immutables ----------

    IERC20 public immutable weth;
    IERC20 public sigil;                    // set post-Pons-launch via setSigil()
    RewardVault public immutable vault;
    BurnRegistry public immutable burnRegistry;
    SigilCertificate public immutable certificate;

    // ---------- Storage ----------

    ISwapRouter public swapRouter;          // UniV2-compatible router with SIGIL/weth pool
    address[] public buybackPath;
    uint16 public sigilBps = 5000;          // 50% → buyback + protocol NFT
    uint16 public dividendBps = 5000;       // 50% → RewardVault (user + protocol NFTs)
    uint256 public minFlushAmount = 1e6;    // 1 weth (6 decimals) minimum before flush
    uint256 public maxSlippageBps = 500;    // 5% max buyback slippage

    // Protocol-owned NFTs currently staked (tracked so we can harvest per flush).
    // Kept in-storage as append-only array — never removed, since stakes are permanent.
    uint256[] public protocolNfts;

    // ---------- Events ----------

    event Flushed(
        uint256 totalRSpy,
        uint256 forBuyback,
        uint256 sigilBought,
        uint256 newProtocolTokenId,
        uint256 forDividend,
        uint256 harvestedRSpy
    );
    event SigilTokenSet(address indexed sigil);
    event SwapRouterSet(address indexed router);
    event BuybackPathSet(address[] path);
    event SplitUpdated(uint16 sigilBps, uint16 dividendBps);
    event ThresholdsUpdated(uint256 minFlushAmount, uint256 maxSlippageBps);

    // ---------- Errors ----------

    error BadSplit();
    error BelowMinFlush();
    error SigilNotSet();
    error PathTooShort();

    // ---------- Constructor ----------

    constructor(
        address _owner,
        IERC20 _weth,
        RewardVault _vault,
        BurnRegistry _burnRegistry,
        SigilCertificate _certificate
    ) Ownable(_owner) {
        weth = _weth;
        vault = _vault;
        burnRegistry = _burnRegistry;
        certificate = _certificate;

        // pre-approve vault to pull weth dividend deposits
        _weth.forceApprove(address(_vault), type(uint256).max);
    }

    // ---------- Admin ----------

    /// @dev Call after launching $SIGIL on Pons: `router.setSigil(sigilAddress)`
    function setSigil(IERC20 _sigil) external onlyOwner {
        sigil = _sigil;
        // set default direct buyback path weth → SIGIL
        buybackPath = new address[](2);
        buybackPath[0] = address(weth);
        buybackPath[1] = address(_sigil);
        emit SigilTokenSet(address(_sigil));
    }

    function setSwapRouter(ISwapRouter _router) external onlyOwner {
        swapRouter = _router;
        emit SwapRouterSet(address(_router));
    }

    function setBuybackPath(address[] calldata _path) external onlyOwner {
        if (_path.length < 2) revert PathTooShort();
        require(_path[0] == address(weth), "path[0] must be weth");
        require(_path[_path.length - 1] == address(sigil), "path[last] must be SIGIL");
        buybackPath = _path;
        emit BuybackPathSet(_path);
    }

    function setSplit(uint16 _sigilBps, uint16 _dividendBps) external onlyOwner {
        if (_sigilBps + _dividendBps != 10_000) revert BadSplit();
        sigilBps = _sigilBps;
        dividendBps = _dividendBps;
        emit SplitUpdated(_sigilBps, _dividendBps);
    }

    function setThresholds(uint256 _minFlushAmount, uint256 _maxSlippageBps) external onlyOwner {
        require(_maxSlippageBps <= 2000, "slippage cap 20%");
        minFlushAmount = _minFlushAmount;
        maxSlippageBps = _maxSlippageBps;
        emit ThresholdsUpdated(_minFlushAmount, _maxSlippageBps);
    }

    // ---------- Core ----------

    /// @notice The heartbeat — one call per 10-min tick from the distributor bot.
    /// @return newTokenId id of the new protocol NFT just minted (0 if buyback skipped)
    /// @return sigilBought amount of $SIGIL market-bought and burned into the new NFT
    function flush() external nonReentrant returns (uint256 newTokenId, uint256 sigilBought) {
        if (address(sigil) == address(0)) revert SigilNotSet();
        if (vault.totalShares() == 0) revert BelowMinFlush(); // need stakers first

        // ── STEP 0: Harvest last-tick's protocol NFT dividends back into router ──
        uint256 harvested = _harvestProtocolYield();

        uint256 total = weth.balanceOf(address(this));
        if (total < minFlushAmount) revert BelowMinFlush();

        uint256 forBuyback = (total * sigilBps) / 10_000;
        uint256 forDividend = total - forBuyback;

        // ── STEP 1-3: Buy back SIGIL → burn → mint protocol NFT → auto-stake ──
        if (forBuyback > 0 && address(swapRouter) != address(0)) {
            uint256 minOut = _minBuybackOut(forBuyback);
            weth.forceApprove(address(swapRouter), forBuyback);

            uint256 sigilBefore = sigil.balanceOf(address(this));
            swapRouter.swapExactTokensForTokensSupportingFeeOnTransferTokens(
                forBuyback,
                minOut,
                buybackPath,
                address(this),
                block.timestamp
            );
            sigilBought = sigil.balanceOf(address(this)) - sigilBefore;

            if (sigilBought > 0) {
                // Send SIGIL to a dead address permanently — this IS the burn
                sigil.safeTransfer(0x000000000000000000000000000000000000dEaD, sigilBought);

                // Record it as a PROTOCOL certificate: minted to router, immediately staked
                newTokenId = burnRegistry.protocolBurn(sigilBought, forBuyback);
                certificate.approve(address(vault), newTokenId);
                vault.stake(newTokenId);
                protocolNfts.push(newTokenId);
            }
        }

        // ── STEP 4: Distribute the other 50% as dividend ──
        if (forDividend > 0) {
            vault.depositRewards(forDividend);
        }

        emit Flushed(total, forBuyback, sigilBought, newTokenId, forDividend, harvested);
    }

    /// @notice Iterate our owned protocol NFTs, claim each's pending weth.
    ///         Gas-bounded by a soft cap; if we ever accumulate too many NFTs
    ///         we can consolidate (out of scope for MVP — see docs).
    function _harvestProtocolYield() internal returns (uint256 harvested) {
        uint256 len = protocolNfts.length;
        uint256 cap = len > 40 ? 40 : len; // cap per tick to bound gas
        uint256 before = weth.balanceOf(address(this));
        // harvest last-in-first-out — most-recent stakes tend to have most pending
        for (uint256 i = 0; i < cap; i++) {
            uint256 id = protocolNfts[len - 1 - i];
            try vault.claim(id) returns (uint256) {} catch {}
        }
        harvested = weth.balanceOf(address(this)) - before;
    }

    // ---------- Views ----------

    function pendingRSpy() external view returns (uint256) {
        return weth.balanceOf(address(this));
    }

    function protocolNftCount() external view returns (uint256) {
        return protocolNfts.length;
    }

    function _minBuybackOut(uint256 amountIn) internal view returns (uint256) {
        try swapRouter.getAmountsOut(amountIn, buybackPath) returns (uint[] memory amounts) {
            uint256 expected = amounts[amounts.length - 1];
            return (expected * (10_000 - maxSlippageBps)) / 10_000;
        } catch {
            return 0;
        }
    }

    // ---------- IERC721Receiver ----------

    function onERC721Received(address, address, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return this.onERC721Received.selector;
    }
}

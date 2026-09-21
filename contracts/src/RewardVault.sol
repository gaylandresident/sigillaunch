// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SigilCertificate} from "./SigilCertificate.sol";

/// @title RewardVault
/// @notice Stake SigilCertificate NFTs to earn a share of weth dividends funded
///         by fees from SigilLaunchpad. Uses classic accRewardPerShare accounting
///         with rarity-weighted shares.
contract RewardVault is IERC721Receiver, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ---------- Storage ----------

    SigilCertificate public immutable certificate;
    IERC20 public immutable rewardToken; // weth

    address public feeSource; // SigilLaunchpad fee splitter — only address that can deposit rewards

    uint256 public totalShares;
    uint256 public accRewardPerShare; // scaled 1e18

    struct StakeInfo {
        address owner;
        uint256 shares;      // rarity-weighted
        uint256 rewardDebt;  // shares * accRewardPerShare / 1e18 at stake time
    }

    mapping(uint256 tokenId => StakeInfo) public stakes;

    // Rarity → share multiplier (1x, 3x, 10x, 30x)
    uint256[4] public rarityMultipliers = [1e18, 3e18, 10e18, 30e18];

    // ---------- Events ----------

    event Staked(address indexed user, uint256 indexed tokenId, uint256 shares);
    event Unstaked(address indexed user, uint256 indexed tokenId);
    event Claimed(address indexed user, uint256 indexed tokenId, uint256 amount);
    event RewardsDeposited(uint256 amount, uint256 accRewardPerShare);
    event FeeSourceUpdated(address indexed newSource);

    // ---------- Errors ----------

    error NotOwner();
    error NotStaked();
    error OnlyFeeSource();
    error NoShares();

    // ---------- Constructor ----------

    constructor(address _owner, SigilCertificate _certificate, IERC20 _rewardToken) Ownable(_owner) {
        certificate = _certificate;
        rewardToken = _rewardToken;
    }

    // ---------- Admin ----------

    function setFeeSource(address _feeSource) external onlyOwner {
        feeSource = _feeSource;
        emit FeeSourceUpdated(_feeSource);
    }

    function setRarityMultiplier(uint8 tier, uint256 multiplier) external onlyOwner {
        require(tier < 4, "bad tier");
        rarityMultipliers[tier] = multiplier;
    }

    // ---------- User ----------

    function stake(uint256 tokenId) external nonReentrant {
        // pull NFT (must approve first)
        certificate.safeTransferFrom(msg.sender, address(this), tokenId);

        SigilCertificate.BurnRecord memory rec = certificate.getBurnRecord(tokenId);
        uint256 shares = rarityMultipliers[uint256(rec.rarity)];

        stakes[tokenId] = StakeInfo({
            owner: msg.sender,
            shares: shares,
            rewardDebt: (shares * accRewardPerShare) / 1e18
        });
        totalShares += shares;

        emit Staked(msg.sender, tokenId, shares);
    }

    function claim(uint256 tokenId) external nonReentrant returns (uint256 pending) {
        StakeInfo storage s = stakes[tokenId];
        if (s.owner != msg.sender) revert NotOwner();
        if (s.shares == 0) revert NotStaked();

        pending = _pending(s);
        if (pending > 0) {
            s.rewardDebt = (s.shares * accRewardPerShare) / 1e18;
            rewardToken.safeTransfer(msg.sender, pending);
            emit Claimed(msg.sender, tokenId, pending);
        }
    }

    function unstake(uint256 tokenId) external nonReentrant {
        StakeInfo storage s = stakes[tokenId];
        if (s.owner != msg.sender) revert NotOwner();
        if (s.shares == 0) revert NotStaked();

        // auto-claim
        uint256 pending = _pending(s);
        totalShares -= s.shares;
        address owner = s.owner;
        delete stakes[tokenId];

        if (pending > 0) rewardToken.safeTransfer(owner, pending);
        certificate.safeTransferFrom(address(this), owner, tokenId);

        emit Claimed(owner, tokenId, pending);
        emit Unstaked(owner, tokenId);
    }

    function pendingRewards(uint256 tokenId) external view returns (uint256) {
        return _pending(stakes[tokenId]);
    }

    // ---------- Fee source (launchpad) ----------

    /// @notice Called by SigilLaunchpad's fee splitter to top up reward pool
    function depositRewards(uint256 amount) external nonReentrant {
        if (msg.sender != feeSource) revert OnlyFeeSource();
        if (totalShares == 0) revert NoShares();
        rewardToken.safeTransferFrom(msg.sender, address(this), amount);
        accRewardPerShare += (amount * 1e18) / totalShares;
        emit RewardsDeposited(amount, accRewardPerShare);
    }

    // ---------- Internals ----------

    function _pending(StakeInfo memory s) internal view returns (uint256) {
        if (s.shares == 0) return 0;
        return (s.shares * accRewardPerShare) / 1e18 - s.rewardDebt;
    }

    // ---------- IERC721Receiver ----------

    function onERC721Received(address, address, uint256, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        return this.onERC721Received.selector;
    }
}

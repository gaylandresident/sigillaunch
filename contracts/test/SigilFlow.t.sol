// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {SigilCertificate} from "../src/SigilCertificate.sol";
import {BurnRegistry} from "../src/BurnRegistry.sol";
import {RewardVault} from "../src/RewardVault.sol";
import {DividendRouter} from "../src/DividendRouter.sol";
import {ISwapRouter} from "../src/interfaces/ISwapRouter.sol";
import {IZip227} from "../src/interfaces/IZip227.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Mockweth is ERC20 {
    constructor() ERC20("Mock weth", "weth") {}
    function mint(address to, uint256 amt) external { _mint(to, amt); }
}

contract MockSIGIL is ERC20 {
    constructor() ERC20("SIGIL", "SIGIL") {}
    function mint(address to, uint256 amt) external { _mint(to, amt); }
}

/// @notice Mock UniV2-style router that lets us exercise the buyback path
///         without a real DEX. Simulates a fixed 1 weth = 1000 SIGIL rate.
contract MockSwapRouter is ISwapRouter {
    IERC20 public tokenIn;
    IERC20 public tokenOut;
    MockSIGIL public sigil;

    constructor(IERC20 _in, MockSIGIL _out) {
        tokenIn = _in;
        tokenOut = _out;
        sigil = _out;
    }

    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint /* deadline */
    ) external override {
        require(path[0] == address(tokenIn) && path[path.length - 1] == address(tokenOut), "bad path");
        // pull weth from caller (the DividendRouter)
        tokenIn.transferFrom(msg.sender, address(this), amountIn);
        // mint SIGIL to recipient (simulating buyback + burn to 0x...dEaD)
        uint out = amountIn * 1000;
        require(out >= amountOutMin, "slippage");
        sigil.mint(to, out);
    }

    function getAmountsOut(uint amountIn, address[] calldata path)
        external
        view
        override
        returns (uint[] memory amounts)
    {
        amounts = new uint[](path.length);
        amounts[0] = amountIn;
        amounts[path.length - 1] = amountIn * 1000;
    }
}

contract SigilFlowTest is Test {
    SigilCertificate cert;
    BurnRegistry registry;
    RewardVault vault;
    DividendRouter router;
    Mockweth weth;
    MockSIGIL sigil;
    MockSwapRouter swapRouter;

    address owner = address(this);
    address attester;
    uint256 attesterKey = 0xA11CE;
    address alice = address(0xA1);

    function setUp() public {
        attester = vm.addr(attesterKey);
        weth = new Mockweth();
        sigil = new MockSIGIL();

        cert = new SigilCertificate(owner, "https://sigillaunch.com/nft");
        registry = new BurnRegistry(owner, cert, attester, 0.0005 ether);
        cert.setBurnRegistry(address(registry));

        vault = new RewardVault(owner, cert, IERC20(address(weth)));

        swapRouter = new MockSwapRouter(IERC20(address(weth)), sigil);

        router = new DividendRouter(
            owner,
            IERC20(address(weth)),
            IERC20(address(sigil)),
            vault,
            swapRouter
        );
        vault.setFeeSource(address(router));

        vm.deal(alice, 10 ether);
    }

    // -----------------------------------------------------------
    // Burn → certificate mint
    // -----------------------------------------------------------

    function test_claim_mints_certificate() public {
        _claimFor(alice, 20_000e8, keccak256("legend"));
        assertEq(cert.balanceOf(alice), 1);
    }

    // -----------------------------------------------------------
    // Fee flow: fees hit router → 50% buyback + burn, 50% dividend
    // -----------------------------------------------------------

    function test_flush_splits_50_50() public {
        // Alice stakes a LEGENDARY certificate (weight 30x)
        uint256 tokenId = _claimFor(alice, 20_000e8, keccak256("t1"));
        vm.prank(alice);
        cert.approve(address(vault), tokenId);
        vm.prank(alice);
        vault.stake(tokenId);

        // Simulate 1000 weth of platform fees arriving at the DividendRouter
        // (In production these come from the Pons creator wallet — Router IS
        //  the creator wallet, so fees just show up here.)
        weth.mint(address(router), 1000e18);

        assertEq(router.pendingweth(), 1000e18);

        // Flush
        (uint256 totalweth, uint256 sigilBought) = router.flush();
        assertEq(totalweth, 1000e18);

        // 50% (500 weth) went to buyback → produced 500 * 1000 = 500,000 SIGIL burned
        assertEq(sigilBought, 500_000e18);
        assertEq(sigil.balanceOf(router.BURN_SINK()), 500_000e18);

        // 50% (500 weth) went to vault
        assertEq(weth.balanceOf(address(vault)), 500e18);

        // Alice can now claim her share
        uint256 before = weth.balanceOf(alice);
        vm.prank(alice);
        vault.claim(tokenId);
        assertEq(weth.balanceOf(alice) - before, 500e18); // sole staker → all dividend
    }

    function test_flush_reverts_when_no_stakers() public {
        weth.mint(address(router), 1000e18);
        vm.expectRevert(DividendRouter.BelowMinFlush.selector);
        router.flush();
    }

    function test_split_admin_configurable() public {
        router.setSplit(7000, 3000); // 70% buyback, 30% dividend
        assertEq(router.sigilBps(), 7000);

        vm.expectRevert(DividendRouter.BadSplit.selector);
        router.setSplit(6000, 3000);
    }

    // -----------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------

    function _sign(
        address burner,
        SigilCertificate.SourceChain chain,
        address srcToken,
        uint256 amount,
        uint256 usdValue,
        uint256 burnBlock,
        bytes32 burnTx
    ) internal view returns (bytes memory) {
        bytes32 digest = keccak256(
            abi.encode(
                block.chainid,
                address(registry),
                burner,
                chain,
                srcToken,
                amount,
                usdValue,
                burnBlock,
                burnTx
            )
        );
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(attesterKey, ethHash);
        return abi.encodePacked(r, s, v);
    }

    function _claimFor(address user, uint256 usdValue, bytes32 burnTx) internal returns (uint256 tokenId) {
        SigilCertificate.SourceChain chain = SigilCertificate.SourceChain.ETHEREUM;
        address srcToken = address(0xdead);
        uint256 amount = 1e18;
        bytes memory sig = _sign(user, chain, srcToken, amount, usdValue, 1, burnTx);
        IZip227.IssueBundle memory bundle;
        bundle.issuer = hex"00";
        bundle.actions = new IZip227.IssueAction[](0);
        bundle.issueAuthSig = hex"00";
        vm.deal(user, 1 ether);
        vm.prank(user);
        tokenId = registry.claim{value: 0.0005 ether}(chain, srcToken, amount, usdValue, 1, burnTx, bundle, sig);
    }
}

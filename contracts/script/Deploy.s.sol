// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {SigilCertificate} from "../src/SigilCertificate.sol";
import {BurnRegistry} from "../src/BurnRegistry.sol";
import {RewardVault} from "../src/RewardVault.sol";
import {DividendRouter} from "../src/DividendRouter.sol";
import {SigilLaunchpad, IWETH} from "../src/SigilLaunchpad.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Deploys the full SIGIL stack on Robinhood Chain.
///
/// Post-deploy checklist:
///   1. Launch $SIGIL on Pons V2 (or via our own launchpad), pair = WETH,
///      creator wallet = DividendRouter address
///   2. router.setSigil(<sigil_address>) + router.setSwapRouter(<pool_router>)
///   3. Start distributor bot with these addresses
contract Deploy is Script {
    /// Robinhood Chain canonical WETH (L2 Weth from official docs)
    address constant WETH = 0x7943e237c7F95DA44E0301572D358911207852Fa;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address attester = vm.envAddress("ATTESTER_ADDRESS");
        string memory baseImageURI = vm.envString("BASE_IMAGE_URI");

        vm.startBroadcast(deployerKey);

        SigilCertificate cert = new SigilCertificate(deployer, baseImageURI);
        console2.log("SigilCertificate:", address(cert));

        BurnRegistry registry = new BurnRegistry(deployer, cert, attester, 0.0005 ether);
        console2.log("BurnRegistry:  ", address(registry));
        cert.setBurnRegistry(address(registry));

        RewardVault vault = new RewardVault(deployer, cert, IERC20(WETH));
        console2.log("RewardVault:   ", address(vault));

        DividendRouter router = new DividendRouter(
            deployer,
            IERC20(WETH),
            vault,
            registry,
            cert
        );
        console2.log("DividendRouter:", address(router));

        vault.setFeeSource(address(router));
        registry.setDividendRouter(address(router));

        SigilLaunchpad launchpad = new SigilLaunchpad(deployer, IWETH(WETH), address(router));
        console2.log("SigilLaunchpad:", address(launchpad));

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== NEXT STEPS ===");
        console2.log("1. Optional: launch $SIGIL via our own launchpad OR on Pons V2");
        console2.log("2. router.setSigil(<sigil>) + router.setSwapRouter(<poolRouter>)");
        console2.log("3. Fund distributor bot with a bit of ETH, `fly deploy`");
    }
}

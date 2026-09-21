// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ISwapRouter — minimal Uniswap V2-style router interface used by DividendRouter.
/// @dev Compatible with any UniV2-fork on Robinhood Chain. Can be swapped for a V4
///      universal-router adapter without changing DividendRouter's public interface.
interface ISwapRouter {
    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external;

    function getAmountsOut(uint amountIn, address[] calldata path)
        external
        view
        returns (uint[] memory amounts);
}

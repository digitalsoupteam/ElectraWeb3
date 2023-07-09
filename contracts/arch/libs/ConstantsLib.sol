// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

library ConstantsLib {
    uint256 internal constant ONE_ROUND = 1 weeks;
    uint256 internal constant ROUNDS_IN_ONE_YEAR = 52;
    uint256 internal constant MIN_ROUNDS_IN_STAKING = 2 * ROUNDS_IN_ONE_YEAR;
    address internal constant BNB_PLACEHOLDER = address(0);
    uint256 internal constant USD_DECIMALS = 18;
}

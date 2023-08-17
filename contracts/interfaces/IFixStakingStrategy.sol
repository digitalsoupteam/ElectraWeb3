// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

interface IFixStakingStrategy {
    function initialize(
        address _governance,
        uint256 _rewardsRate,
        uint256 _lockYears,
        uint256 _yearDeprecationRate
    ) external;

    function claim(uint256 _tokenId, address _withdrawToken) external;

    function sell(uint256 _tokenId, address _withdrawToken) external;
}

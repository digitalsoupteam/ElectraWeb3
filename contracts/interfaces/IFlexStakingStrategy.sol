// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

interface IFlexStakingStrategy {
    function setEarnings(uint256 _month, uint256 _year, uint256 _earning) external;

    function claim(uint256 _tokenId, address _withdrawToken) external;

    function sell(uint256 _tokenId, address _withdrawToken) external;
}

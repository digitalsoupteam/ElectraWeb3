// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

interface IStakingStrategy {
    function stake(address _itemAddress, uint256 _itemId, bytes memory _payload) external;
}
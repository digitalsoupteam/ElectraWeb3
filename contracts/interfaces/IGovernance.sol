// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

interface IGovernance {
    function treasury() external view returns (address);
    function stakingPlatform() external view returns (address);
    function itemsFactory() external view returns (address);
}

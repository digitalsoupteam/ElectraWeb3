// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

interface IAddressBook {
    function items(address _item) external view returns (bool);

    function stakingStrategies(address _stakingStrategy) external view returns (bool);

    function addItem(address _item) external;

    function addStakingStrategy(address _stakingStrategy) external;
}

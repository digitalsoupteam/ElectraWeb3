// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

interface IGovernance {
    function treasury() external view returns (address);


    function enforceIsItemContract(address _contract) external view;

    function items(address _item) external view returns (bool);

    function stakingStrategies(address _stakingStrategy) external view returns (bool);

    function enforceIsStakingStrategyContract(address _contract) external view;
    // function stakingPlatform() external view returns (address);
    // function itemsFactory() external view returns (address);
}

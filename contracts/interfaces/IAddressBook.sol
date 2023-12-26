// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

interface IAddressBook {
    function treasury() external view returns (address);

    function enforceIsItemContract(address _contract) external view;

    function enforceIsProductOwner(address _account) external view;
    
    function productOwner() external view returns (address);

    function items(address _item) external view returns (bool);

    function stakingStrategies(address _stakingStrategy) external view returns (bool);

    function enforceIsStakingStrategyContract(address _contract) external view;
}

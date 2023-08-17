// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

interface IFactory {
    function setItemImplementation(address _itemImplementation) external;

    function setFixStakingStrategyImplementation(
        address _fixStakingStrategyImplementation
    ) external;

    function setFlexStakingStrategyImplementation(
        address _flexStakingStrategyImplementation
    ) external;

    function setPricerImplementation(address _pricerImplementation) external;

    function deployPricer(
        int256 _initialPrice,
        string calldata _description
    ) external returns (address);

    function deployItem(
        string calldata _name,
        string calldata _symbol,
        uint256 _price,
        uint256 _maxSupply
    ) external returns (address);

    function deployFixStakingStrategy(
        uint256 _rewardsRate,
        uint256 _lockYears,
        uint256 _yearDeprecationRate
    ) external returns (address);

    function deployFlexStakingStrategy(
        uint256 _minLockYears,
        uint256 _maxLockYears,
        uint256 _initialMonths,
        uint256 _initialRewardsRate,
        uint256 _yearDeprecationRate
    ) external returns (address);
}

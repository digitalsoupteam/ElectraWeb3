// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

interface IFlexStakingStrategy {
     function initialize(
        address _governance,
        address _treasury,
        address _addressBook,
        uint256 _minLockYears,
        uint256 _maxLockYears,
        uint256 _initialMonths,
        uint256 _initialRewardsRate,
        uint256 _yearDeprecationRate
    ) external;
    
    function setEarnings(uint256 _month, uint256 _year, uint256 _earning) external;

    function claim(uint256 _tokenId, address _withdrawToken) external;

    function sell(uint256 _tokenId, address _withdrawToken) external;
}

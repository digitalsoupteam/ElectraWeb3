// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

interface IPricer {
    function initialize(
        address _owner,
        int256 _initialPrice,
        string calldata _description
    ) external;

    function decimals() external view returns (uint8);

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );

    function setCurrentPrice(int256 _newPrice) external;
}
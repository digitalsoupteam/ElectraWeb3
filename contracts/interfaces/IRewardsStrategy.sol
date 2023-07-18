// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

interface IRewardsStrategy {
  function claimRewards(
        uint256 _stakingId
    ) external returns (uint256 totalRewards_, uint256 roundsToClaim_);
  
    function registerStaking(uint256 _stakingId) external;
    function removeStaking(uint256 _stakingId) external;

    function enable(uint256 _stakingId, uint256 _startRound) external;

    function disable(uint256 _stakingId) external;

    function roundInOnePeriod() external view returns(uint256);

     function name() external pure returns(string memory);
}

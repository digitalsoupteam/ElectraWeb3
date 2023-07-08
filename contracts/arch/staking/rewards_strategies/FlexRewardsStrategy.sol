// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import { StakingPlatformRole } from "../../roles/StakingPlatformRole.sol";
import { GovernanceRole } from "../../roles/GovernanceRole.sol";
import { IRewardsStrategy } from "../../interfaces/IRewardsStrategy.sol";
import { IStakingPlatform } from "../../interfaces/IStakingPlatform.sol";
import { ConstantsLib } from "../../libs/ConstantsLib.sol";

contract FlexRewardsStrategy is
    IRewardsStrategy,
    UUPSUpgradeable,
    GovernanceRole,
    StakingPlatformRole
{
    mapping(uint256 => uint256) public earningsPerRound;
    mapping(uint256 => uint256) public depositsToRemoveInRound;
    mapping(uint256 => uint256) public depositsInRound;

    uint256 public lastUpdatedRound;

    mapping(uint256 => bool) public registeredStakings;

    function roundInOnePeriod() public pure returns (uint256) {
        return 4;
    }

    function updateRounds() public returns (bool needMore_) {
        uint256 currentRound;
        if (currentRound - lastUpdatedRound > 100) {
            needMore_ = true;
            currentRound = lastUpdatedRound + 100;
        }
        for (uint256 round = lastUpdatedRound + 1; round < currentRound; round++) {
            depositsInRound[round] += depositsInRound[round - 1];
            depositsInRound[round] -= depositsToRemoveInRound[round];
        }
        lastUpdatedRound = currentRound - 1;
    }

    function _enfroseIsStakingRegistered(uint256 _stakingId) internal view {
        require(registeredStakings[_stakingId], "FlexRewardsStrategy: staking not exists!");
    }

    function registerStaking(uint256 _stakingId) external {
        _enforceIsStakingPlatform();
        require(registeredStakings[_stakingId] == false, "FlexRewardsStrategy: staking exists!");

        registeredStakings[_stakingId] = true;
    }

    function removeStaking(uint256 _stakingId) external {
        _enforceIsStakingPlatform();
        _enfroseIsStakingRegistered(_stakingId);

        delete registeredStakings[_stakingId];
    }

    function setEarningsPerRound(uint256 _round, uint256 _earnings) public {
        _enforceIsGovernance();

        earningsPerRound[_round] = _earnings;
    }

    function enable(uint256 _stakingId, uint256 _startRound) public {
        _enforceIsStakingPlatform();
        _enfroseIsStakingRegistered(_stakingId);

        IStakingPlatform _stakingPlatform = IStakingPlatform(stakingPlatform);
        IStakingPlatform.StakingInfo memory stakingInfo = _stakingPlatform.stakingsInfo(_stakingId);

        uint256 totalPrice = stakingInfo.totalPrice;
        depositsInRound[_startRound] += totalPrice;
        depositsToRemoveInRound[stakingInfo.finalRound] += totalPrice;
    }

    function disable(uint256 _stakingId) public {
        _enforceIsStakingPlatform();
        _enfroseIsStakingRegistered(_stakingId);

        IStakingPlatform _stakingPlatform = IStakingPlatform(stakingPlatform);
        IStakingPlatform.StakingInfo memory stakingInfo = _stakingPlatform.stakingsInfo(_stakingId);

        uint256 totalPrice = stakingInfo.totalPrice;
        uint256 round = _stakingPlatform.getRound(block.timestamp);

        depositsInRound[round] -= totalPrice;
        depositsToRemoveInRound[stakingInfo.finalRound] -= totalPrice;
    }

    function claimRewards(
        uint256 _stakingId
    ) external view returns (uint256 totalRewards_, uint256 roundsToClaim_) {
        _enforceIsStakingPlatform();
        _enfroseIsStakingRegistered(_stakingId);

        IStakingPlatform _stakingPlatform = IStakingPlatform(stakingPlatform);
        IStakingPlatform.StakingInfo memory stakingInfo = _stakingPlatform.stakingsInfo(_stakingId);
        uint256 lastRound = _stakingPlatform.getRound(block.timestamp) - 1;
        if (lastRound > stakingInfo.finalRound) lastRound = stakingInfo.finalRound;
        uint256 allExpiredRounds = lastRound - stakingInfo.initialRound;
        lastRound -= allExpiredRounds % roundInOnePeriod();

        uint256 totalPrice = stakingInfo.totalPrice;

        for (uint256 round = stakingInfo.lastClaimedRound + 1; round <= lastRound; round++) {
            uint256 earnings = earningsPerRound[round];
            if (earnings == 0) break;

            uint256 deposits = depositsInRound[round];
            uint256 k = (earnings * 1e18) / deposits;
            uint256 rewards = (totalPrice * k) / 1e18;
            totalRewards_ += rewards;
            roundsToClaim_++;
        }
    }

    function _authorizeUpgrade(address) internal view override {
        _enforceIsGovernance();
    }

    function initialize(address _governance, address _stakingPlatform) public initializer {
        governance = _governance;
        stakingPlatform = _stakingPlatform;
    }
}

// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import { StakingPlatformRole } from "../../roles/StakingPlatformRole.sol";
import { GovernanceRole } from "../../roles/GovernanceRole.sol";
import { IRewardsStrategy } from "../../interfaces/IRewardsStrategy.sol";
import { IStakingPlatform } from "../../interfaces/IStakingPlatform.sol";
import { ConstantsLib } from "../../libs/ConstantsLib.sol";
// import "hardhat/console.sol";

contract StableRewardsStrategy is
    IRewardsStrategy,
    UUPSUpgradeable,
    GovernanceRole,
    StakingPlatformRole
{
    // ------------------------------------------------------------------------------------
    // ----- STORAGE ----------------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    mapping(uint256 => bool) public registeredStakings;

    // ------------------------------------------------------------------------------------
    // ----- DEPLOY & UPGRADE  ------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    function _authorizeUpgrade(address) internal view override {
        _enforceIsGovernance();
    }

    function initialize(address _governance, address _stakingPlatform) public initializer {
        governance = _governance;
        stakingPlatform = _stakingPlatform;
    }

    // ------------------------------------------------------------------------------------
    // ----- VIEW  ------------------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    function roundInOnePeriod() public pure returns (uint256) {
        return 4;
    }

    function name() external pure returns (string memory) {
        return "STABLE";
    }

    // ------------------------------------------------------------------------------------
    // ----- STAKING PLATFORM ACTIONS  ----------------------------------------------------
    // ------------------------------------------------------------------------------------

    function registerStaking(uint256 _stakingId) external {
        _enforceIsStakingPlatform();
        require(registeredStakings[_stakingId] == false, "StableRewardsStrategy: staking exists!");

        registeredStakings[_stakingId] = true;
    }

    function removeStaking(uint256 _stakingId) external {
        _enforceIsStakingPlatform();
        _enfroseIsStakingRegistered(_stakingId);

        delete registeredStakings[_stakingId];
    }

    function enable(uint256 _stakingId, uint256 _initialRound) external view {
        _enforceIsStakingPlatform();
        _enfroseIsStakingRegistered(_stakingId);
    }

    function disable(uint256 _stakingId) external view {
        _enforceIsStakingPlatform();
        _enfroseIsStakingRegistered(_stakingId);
    }

    function claimRewards(
        uint256 _stakingId
    ) public view returns (uint256 totalRewards_, uint256 roundsToClaim_) {
        _enfroseIsStakingRegistered(_stakingId);

        uint256 percent;
        IStakingPlatform _stakingPlatform = IStakingPlatform(stakingPlatform);
        IStakingPlatform.StakingInfo memory stakingInfo = _stakingPlatform.stakingsInfo(_stakingId);

        uint256 lastRound = _stakingPlatform.getRound(block.timestamp) - 1;
        if (lastRound > stakingInfo.finalRound) lastRound = stakingInfo.finalRound;

        uint256 allExpiredRounds = lastRound - stakingInfo.initialRound + 1;

        if (lastRound != stakingInfo.finalRound) {
            lastRound -= allExpiredRounds % roundInOnePeriod();
        }

        uint256 percentForYear = 15;
        uint256 percentByRound = percent / 4;
        uint256 rewardsForOneRound = (stakingInfo.totalPrice * percentByRound) / 100;

        uint256 expiredYears = allExpiredRounds / ConstantsLib.ROUNDS_IN_ONE_YEAR;
        uint256 totalPrice = stakingInfo.totalPrice;
        // console.log("expiredYears", expiredYears);
        // console.log("lastRound", lastRound);
        // console.log("allExpiredRounds", allExpiredRounds);
        for (uint256 i; i <= expiredYears; i++) {
            totalPrice -= (totalPrice * i * 10) / 100;

            uint256 endRound = stakingInfo.initialRound + (i + 1) * ConstantsLib.ROUNDS_IN_ONE_YEAR;
            if (endRound > lastRound) endRound = lastRound;
            // console.log("endRound", endRound);

            uint256 lastClaimedRound = stakingInfo.initialRound + stakingInfo.claimedRoundsCount;
            // console.log("lastClaimedRound", lastClaimedRound);

            if (lastClaimedRound < endRound) {
                uint256 claimedRounds = endRound - lastClaimedRound;
                stakingInfo.claimedRoundsCount += claimedRounds;
                totalRewards_ +=
                    (stakingInfo.totalPrice * claimedRounds * percentForYear) /
                    ConstantsLib.ROUNDS_IN_ONE_YEAR /
                    100;
                roundsToClaim_ += claimedRounds;
            }
        }
    }

    // ------------------------------------------------------------------------------------
    // ----- INTERNAL METHODS  ------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    function _enfroseIsStakingRegistered(uint256 _stakingId) internal view {
        require(registeredStakings[_stakingId], "StableRewardsStrategy: staking not exists!");
    }
}

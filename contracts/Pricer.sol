// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import { GovernanceRole } from "./roles/GovernanceRole.sol";
import { IPricer } from "./interfaces/IPricer.sol";

contract Pricer is IPricer, UUPSUpgradeable, GovernanceRole {
    // ------------------------------------------------------------------------------------
    // ----- STORAGE ----------------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    int256 public currentPrice;
    string public description;

    // ------------------------------------------------------------------------------------
    // ----- EVENTS -----------------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    event SetPrice(int256 oldPrice, int256 newPrice);

    // ------------------------------------------------------------------------------------
    // ----- DEPLOY & UPGRADE  ------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    function initialize(
        address _governance,
        int256 _initialPrice,
        string calldata _description
    ) public initializer {
        governance = _governance;
        currentPrice = _initialPrice;
        description = _description;
    }

    function _authorizeUpgrade(address) internal view override {
        _enforceIsGovernance();
    }

    // ------------------------------------------------------------------------------------
    // ----- GOVERNANCE ACTIONS  ----------------------------------------------------------
    // ------------------------------------------------------------------------------------

    function setCurrentPrice(int256 _newPrice) external {
        _enforceIsGovernance();

        require(_newPrice > 0, "PricerToUSD: price must be greater than zero!");

        int256 oldPrice = currentPrice;
        currentPrice = _newPrice;

        emit SetPrice(oldPrice, _newPrice);
    }

    // ------------------------------------------------------------------------------------
    // ----- VIEW  ------------------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    function decimals() external pure returns (uint8) {
        return 8;
    }

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        answer = currentPrice;
    }
}

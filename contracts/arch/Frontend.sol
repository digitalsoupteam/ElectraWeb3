// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import { GovernanceRole } from "./roles/GovernanceRole.sol";

contract Frontend is UUPSUpgradeable, GovernanceRole {

    function _authorizeUpgrade(address) internal view override {
        _enforceIsGovernance();
    }
}
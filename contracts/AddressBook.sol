// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { ERC721Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";

import { ITreasury } from "./interfaces/ITreasury.sol";
import { IStakingStrategy } from "./interfaces/IStakingStrategy.sol";
import { GovernanceRole } from "./roles/GovernanceRole.sol";

contract AddressBook is UUPSUpgradeable, GovernanceRole {
    mapping (address => bool) public items;
    mapping (address => bool) public stakingStrategies;

    event NewItem(address _item);
   
    function initialize(
        address _governance
    ) public initializer {
        governance = _governance;
    }

    function _authorizeUpgrade(address) internal view override {
        _enforceIsGovernance();
    }
    
    function addItem(address _item) external {
        _enforceIsGovernance();
        items[_item] = true;
        emit NewItem(_item);
    }  

    function addStakingStrategy(address _stakingStrategy) external {
        _enforceIsGovernance();
        stakingStrategies[_stakingStrategy] = true;
    }

    function deleteStakingStrategy(address _stakingStrategy) external {
        _enforceIsGovernance();
        delete stakingStrategies[_stakingStrategy];
    }
}

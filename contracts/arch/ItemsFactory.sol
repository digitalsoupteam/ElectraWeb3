// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { ERC1155Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import { ERC1155ReceiverUpgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC1155/utils/ERC1155ReceiverUpgradeable.sol";
import { ERC1155HolderUpgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC1155/utils/ERC1155HolderUpgradeable.sol";

import { IItemsFactory } from "./interfaces/IItemsFactory.sol";
import { GovernanceRole } from "./roles/GovernanceRole.sol";
import { StakingPlatformRole } from "./roles/StakingPlatformRole.sol";

contract ItemsFactory is
    IItemsFactory,
    UUPSUpgradeable,
    ERC1155Upgradeable,
    ERC1155HolderUpgradeable,
    GovernanceRole,
    StakingPlatformRole
{
    mapping(uint256 => uint256) public prices;

    uint256[] internal itemsIds;
    mapping(uint256 => string) public itemsNames;

    uint256 public nextItemId;

    function _authorizeUpgrade(address) internal view override {
        _enforceIsGovernance();
    }

    function initialize(address _governance, address _stakingPlatform) public initializer {
        governance = _governance;
        stakingPlatform = _stakingPlatform;
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC1155Upgradeable, ERC1155ReceiverUpgradeable) returns (bool) {
        return
            ERC1155Upgradeable.supportsInterface(interfaceId) ||
            ERC1155ReceiverUpgradeable.supportsInterface(interfaceId);
    }

    function addItem(string calldata _name, uint256 _price) public {
        _enforceIsGovernance();

        uint256 itemId = nextItemId++;
        itemsIds.push(itemId);
        itemsNames[itemId] = _name;
        prices[itemId] = _price;
    }

    function stopItemSell(uint256 _itemId) public {
        _enforceIsGovernance();

        prices[_itemId] = 0;
    }

    function enforseIsSupportedItem(uint256 _item) public view {
        require(prices[_item] > 0, "ItemsFactory: unknown item!");
    }

    function newItems(uint256[] memory _ids, uint256[] memory _amounts) external returns (uint256) {
        _enforceIsStakingPlatform();
        _mintBatch(address(this), _ids, _amounts, "");
        return totalPrice(_ids, _amounts);
    }

    function totalPrice(
        uint256[] memory _ids,
        uint256[] memory _amounts
    ) public view returns (uint256 totalPrice_) {
        for (uint256 i; i < _ids.length; i++) {
            totalPrice_ += prices[_ids[i]] * _amounts[i];
        }
    }
}

// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { ERC1155Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import { ERC1155ReceiverUpgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC1155/utils/ERC1155ReceiverUpgradeable.sol";
import { ERC1155HolderUpgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC1155/utils/ERC1155HolderUpgradeable.sol";

import { IItemsFactory } from "./interfaces/IItemsFactory.sol";
import { GovernanceRole } from "./roles/GovernanceRole.sol";
import { StakingPlatformRole } from "./roles/StakingPlatformRole.sol";

// import "hardhat/console.sol";
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

    mapping(uint256 => bool) public sellDisabled;

    mapping(uint256 => bool) internal _usedItemsIds;

    function _authorizeUpgrade(address) internal view override {
        _enforceIsGovernance();
    }

    function items()
        external
        view
        returns (uint256[] memory itemsIds_, string[] memory itemsNames_, uint256[] memory prices_)
    {
        itemsIds_ = itemsIds;
        itemsNames_ = new string[](itemsIds_.length);
        prices_ = new uint256[](itemsIds_.length);
        for (uint256 i; i < itemsIds_.length; i++) {
            uint256 itemId = itemsIds_[i];
            itemsNames_[i] = itemsNames[itemId];
            prices_[i] = prices[itemId];
        }
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

    function setItemSellDisabled(uint256 _itemId, bool _value) public {
        _enforceIsGovernance();

        sellDisabled[_itemId] = _value;
    }

    function enforseIsSupportedItem(uint256 _item) public view {
        require(prices[_item] > 0, "ItemsFactory: unknown item!");
    }

    function newItems(uint256[] memory _ids, uint256[] memory _amounts) external returns (uint256) {
        _enforceIsStakingPlatform();

        for (uint256 i; i < _ids.length; i++) {
            uint256 itemId = _ids[i];
            require(sellDisabled[_ids[i]] == false, "ItemsFactory: sell disabled!");
            require(_amounts[i] > 0, "ItemsFactory: zero item amount!");
            require(_usedItemsIds[itemId] == false, "ItemsFactory: duplicate item id!");
            _usedItemsIds[itemId] = true;
        }
        for (uint256 i; i < _ids.length; i++) {
            delete _usedItemsIds[_ids[i]];
        }
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

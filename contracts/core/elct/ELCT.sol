// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { ERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

import { IAddressBook } from "../../interfaces/IAddressBook.sol";

contract ELCT is UUPSUpgradeable, ERC20Upgradeable {
    address public addressBook;

    function initialize(
        address _addressBook,
        string calldata _name,
        string calldata _symbol,
        uint256 _initialSupply
    ) public initializer {
        __ERC20_init_unchained(_name, _symbol);
        _mint(msg.sender, _initialSupply);

        require(_addressBook != address(0), "_addressBook is zero!");
        addressBook = _addressBook;
    }

    function _authorizeUpgrade(address) internal view override {
        IAddressBook(addressBook).enforceIsProductOwner(msg.sender);
    }
}

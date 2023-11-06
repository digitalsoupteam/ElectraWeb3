// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { MulticallUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/MulticallUpgradeable.sol";

import { IAddressBook } from "../../interfaces/IAddressBook.sol";

contract Multicall is UUPSUpgradeable, MulticallUpgradeable {
    address public addressBook;

    constructor() {
        _disableInitializers();
    }

    function initialize(address _addressBook) public initializer {
        addressBook = _addressBook;
    }

    function _authorizeUpgrade(address) internal view override {
        IAddressBook(addressBook).enforceIsProductOwner(msg.sender);
    }
}

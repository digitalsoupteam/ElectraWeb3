// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import { ProductOwnerRole } from "./roles/ProductOwnerRole.sol";
import { ITreasury } from "./interfaces/ITreasury.sol";
import { IGovernance } from "./interfaces/IGovernance.sol";
import { IFlexStakingStrategy } from "./interfaces/IFlexStakingStrategy.sol";
import { IAddressBook } from "./interfaces/IAddressBook.sol";
import { IItem } from "./interfaces/IItem.sol";
import { IUUPSUpgradeable } from "./interfaces/IUUPSUpgradeable.sol";

contract Governance is IGovernance, UUPSUpgradeable, ProductOwnerRole {
    // ------------------------------------------------------------------------------------
    // ----- STORAGE ----------------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    address public addressBook;
    address public treasury;
    address public itemImplementation;

    // ------------------------------------------------------------------------------------
    // ----- DEPLOY & UPGRADE  ------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    function _authorizeUpgrade(address) internal view override {
        _enforceIsProductOwner();
    }

    function initialize(address _prodcutOwner) public initializer {
        productOwner = _prodcutOwner;
    }

    // ------------------------------------------------------------------------------------
    // ----- PRODUCT OWNER ACTIONS  -------------------------------------------------------
    // ------------------------------------------------------------------------------------

    function setTreasury(address _treasury) external {
        _enforceIsProductOwner();
        require(treasury == address(0), "Governance: treasury already setted!");

        treasury = _treasury;
    }

    function setAddressBook(address _addressBook) external {
        _enforceIsProductOwner();
        require(addressBook == address(0), "Governance: address book already setted!");

        addressBook = _addressBook;
    }

    function setItemImplementation(address _itemImplementation) external {
        _enforceIsProductOwner();

        itemImplementation = _itemImplementation;
    }

    function withdraw(address _token, uint256 _amount, address _recipient) external {
        _enforceIsProductOwner();

        ITreasury(treasury).withdraw(_token, _amount, _recipient);
    }

    function deposit(address _token, uint256 _amount) external {
        _enforceIsProductOwner();

        IERC20Metadata(_token).transferFrom(msg.sender, treasury, _amount);
    }

    function addToken(address _token, address _pricer) external {
        _enforceIsProductOwner();
        require(ITreasury(treasury).pricers(_token) == address(0), "Governance: token exists!");

        ITreasury(treasury).setTokenPricer(_token, _pricer);
    }

    function updateTokenPricer(address _token, address _pricer) external {
        _enforceIsProductOwner();
        require(_pricer != address(0), "Governance: can't delete token!");
        require(ITreasury(treasury).pricers(_token) != address(0), "Governance: unknown token!");

        ITreasury(treasury).setTokenPricer(_token, _pricer);
    }

    function deleteToken(address _token) external {
        _enforceIsProductOwner();
        require(ITreasury(treasury).pricers(_token) != address(0), "Governance: unknown token!");

        ITreasury(treasury).setTokenPricer(_token, address(0));
    }

    function addItem(
        string calldata _name,
        string calldata _symbol,
        uint256 _price,
        uint256 _maxSupply
    ) public {
        _enforceIsProductOwner();

        IAddressBook(addressBook).addItem(
            address(
                new ERC1967Proxy(
                    itemImplementation,
                    abi.encodeWithSelector(
                        IItem.initialize.selector,
                        address(this),
                        treasury,
                        addressBook,
                        _name,
                        _symbol,
                        _price,
                        _maxSupply
                    )
                )
            )
        );
    }

    function addStakingStrategy(address _stakingStrategy) public {
        _enforceIsProductOwner();

        IAddressBook(addressBook).addStakingStrategy(_stakingStrategy);
    }

    function upgradeTreasury(address _implementation) external {
        _enforceIsProductOwner();

        IUUPSUpgradeable(treasury).upgradeTo(_implementation);
    }

    function setFlexStrategyEarningsPeriod(address _flexStrategy, uint256 _month, uint256 _year, uint256 _sharedEarnings) external {
        _enforceIsProductOwner();
        IFlexStakingStrategy(_flexStrategy).setEarnings(_month, _year, _sharedEarnings);
    }
}

// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import { ITreasury } from "../interfaces/ITreasury.sol";
import { IAddressBook } from "../interfaces/IAddressBook.sol";
import { IPricer } from "../interfaces/IPricer.sol";

contract Treasury is ITreasury, UUPSUpgradeable {
    // ------------------------------------------------------------------------------------
    // ----- CONSTANTS --------------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    uint256 public constant PRICERS_DECIMALS = 8;
    uint256 public constant USD_DECIMALS = 18;

    // ------------------------------------------------------------------------------------
    // ----- STORAGE ----------------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    address public addressBook;
    mapping(address => address) public pricers;
    bool public onlyGovernanceWithdrawn;

    // ------------------------------------------------------------------------------------
    // ----- EVENTS -----------------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    event Withdraw(address indexed from, address indexed to, address indexed token, uint256 amount);

    // ------------------------------------------------------------------------------------
    // ----- DEPLOY & UPGRADE  ------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    function initialize(address _addressBook) public initializer {
        addressBook = _addressBook;
    }

    function _authorizeUpgrade(address) internal view override {
        IAddressBook(addressBook).enforceIsProductOwner(msg.sender);
    }

    // ------------------------------------------------------------------------------------
    // ----- PRODUCT OWNER ACTIONS  -------------------------------------------------------
    // ------------------------------------------------------------------------------------
    
    function setOnlyProductOwnerWithdrawn(bool _value) external {
        IAddressBook(addressBook).enforceIsProductOwner(msg.sender);
        onlyGovernanceWithdrawn = _value;
    }

    function addToken(address _token, address _pricer) external {
        IAddressBook(addressBook).enforceIsProductOwner(msg.sender);

        require(pricers[_token] == address(0), "Treasury: already exists!");
        require(_pricer != address(0), "Treasury: pricer == 0");
        require(IPricer(_pricer).decimals() == PRICERS_DECIMALS, "Treasury: pricer decimals != 8");

        pricers[_token] = _pricer;
    }

    function updateTokenPricer(address _token, address _pricer) external {
        IAddressBook(addressBook).enforceIsProductOwner(msg.sender);

        require(pricers[_token] != address(0), "Treasury: not exists!");
        require(_pricer == address(0), "Treasury: pricer == 0");
        require(IPricer(_pricer).decimals() == PRICERS_DECIMALS, "Treasury: pricer decimals != 8");

        pricers[_token] = _pricer;
    }

    function deleteToken(address _token) external {
        IAddressBook(addressBook).enforceIsProductOwner(msg.sender);
        require(pricers[_token] != address(0), "Treasury: not exists!");
        delete pricers[_token];
    }

    // ------------------------------------------------------------------------------------
    // ----- PRODUCT OWNER & PROTOCOL ACTIONS  --------------------------------------------
    // ------------------------------------------------------------------------------------
    function withdraw(address _token, uint256 _amount, address _recipient) external {
        IAddressBook _addressBook = IAddressBook(addressBook);

        require(
            (_addressBook.stakingStrategies(msg.sender) && onlyGovernanceWithdrawn == false) ||
                _addressBook.productOwner() == msg.sender,
            "Treasury: withdraw not authorized!"
        );

        bool success = IERC20Metadata(_token).transfer(_recipient, _amount);
        require(success, "ERC20 transfer failed!");

        emit Withdraw(msg.sender, _recipient, _token, _amount);
    }

    // ------------------------------------------------------------------------------------
    // ----- VIEW  ------------------------------------------------------------------------
    // ------------------------------------------------------------------------------------
    function usdAmountToToken(uint256 _usdAmount, address _token) public view returns (uint256) {
        IPricer pricer = IPricer(pricers[_token]);
        require(address(pricer) != address(0), "not supported token!");

        (, int256 tokenPrice, , , ) = pricer.latestRoundData();
        return
            (_usdAmount * (10 ** IERC20Metadata(_token).decimals()) * (10 ** PRICERS_DECIMALS)) /
            uint256(tokenPrice) / 10 ** USD_DECIMALS;
    }

    function enforceIsSupportedToken(address _token) external view {
        require(pricers[_token] != address(0), "Treasury: unknown token!");
    }
}

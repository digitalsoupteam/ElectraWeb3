// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

import { ITreasury } from "../interfaces/ITreasury.sol";
import { IAddressBook } from "../interfaces/IAddressBook.sol";
import { IPricer } from "../interfaces/IPricer.sol";

contract Treasury is ITreasury, UUPSUpgradeable, ReentrancyGuardUpgradeable {
    // ------------------------------------------------------------------------------------
    // ----- LIBRARIES --------------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    using SafeERC20 for IERC20Metadata;

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

    constructor() {
        _disableInitializers();
    }

    function initialize(address _addressBook) public initializer {
        require(_addressBook != address(0), "_addressBook!");
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

    /// @dev Only verified tokens are used without hidden fees
    /// Adds a new token to the protocol. If the token already exists,
    /// it will throw an exception. To update the pricer use updateTokenPricer
    function addToken(address _token, address _pricer) external {
        IAddressBook(addressBook).enforceIsProductOwner(msg.sender);

        require(pricers[_token] == address(0), "Treasury: already exists!");
        require(_pricer != address(0), "Treasury: pricer == 0");
        require(IPricer(_pricer).decimals() == PRICERS_DECIMALS, "Treasury: pricer decimals != 8");

        pricers[_token] = _pricer;
    }

    /// @dev Updates the pricer of an already registered token.
    /// If the token is not registered it will throw an exception
    function updateTokenPricer(address _token, address _pricer) external {
        IAddressBook(addressBook).enforceIsProductOwner(msg.sender);

        enforceIsSupportedToken(_token);
        require(_pricer == address(0), "Treasury: pricer == 0");
        require(IPricer(_pricer).decimals() == PRICERS_DECIMALS, "Treasury: pricer decimals != 8");

        pricers[_token] = _pricer;
    }

    /// @dev Removes a token from use of the protocol.
    /// If the token is not registered it will throw an exception
    function deleteToken(address _token) external {
        IAddressBook(addressBook).enforceIsProductOwner(msg.sender);
        enforceIsSupportedToken(_token);
        delete pricers[_token];
    }

    // ------------------------------------------------------------------------------------
    // ----- PRODUCT OWNER & PROTOCOL ACTIONS  --------------------------------------------
    // ------------------------------------------------------------------------------------

    function withdraw(address _token, uint256 _amount, address _recipient) external nonReentrant {
        require(_amount > 0, "Treasury: withdrawn amount is zero!");
        IAddressBook _addressBook = IAddressBook(addressBook);

        // Checks function permission
        // An explicit comparison with false is used, since it is much clearer than negation
        require(
            (_addressBook.stakingStrategies(msg.sender) && onlyGovernanceWithdrawn == false) ||
                _addressBook.productOwner() == msg.sender,
            "Treasury: withdraw not authorized!"
        );

        if (_token == address(0)) {
            (bool success, ) = _recipient.call{ value: _amount }("");
            require(success, "treasury transfer failed!");
        } else {
            IERC20Metadata(_token).safeTransfer(_recipient, _amount);
        }

        emit Withdraw(msg.sender, _recipient, _token, _amount);
    }

    // ------------------------------------------------------------------------------------
    // ----- VIEW  ------------------------------------------------------------------------
    // ------------------------------------------------------------------------------------
    function usdAmountToToken(uint256 _usdAmount, address _token) public view returns (uint256) {
        IPricer pricer = IPricer(pricers[_token]);
        require(address(pricer) != address(0), "not supported token!");

        (, int256 tokenPrice, , , ) = pricer.latestRoundData();
        uint256 decimals = _token == address(0) ? 18 : IERC20Metadata(_token).decimals();
        uint256 amount = (_usdAmount * (10 ** decimals) * (10 ** PRICERS_DECIMALS)) /
            uint256(tokenPrice) /
            10 ** USD_DECIMALS;
        require(amount > 0, "token amount is zero!");
        return amount;
    }

    /// @dev Checks whether the token is registered. Registered tokens have a pricer
    function enforceIsSupportedToken(address _token) public view {
        require(pricers[_token] != address(0), "Treasury: unknown token!");
    }

    receive() external payable {}
}

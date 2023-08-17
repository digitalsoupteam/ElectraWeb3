// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import { ITreasury } from "./interfaces/ITreasury.sol";
import { IAddressBook } from "./interfaces/IAddressBook.sol";
import { IPricer } from "./interfaces/IPricer.sol";

contract Treasury is ITreasury, UUPSUpgradeable {
    // ------------------------------------------------------------------------------------
    // ----- CONSTANTS --------------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    uint256 public constant PRICERS_DECIMALS = 8;

    // ------------------------------------------------------------------------------------
    // ----- STORAGE ----------------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    address public addressBook;
    mapping(address => address) public pricers;
    address[] internal _tokens;
    mapping(address => uint256) internal _tokensIndexes;
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
    function setOnlyGovernanceWithdrawn(bool _value) external {
        IAddressBook(addressBook).enforceIsProductOwner(msg.sender);
        onlyGovernanceWithdrawn = _value;
    }

    function setTokenPricer(address _token, address _pricer) external {
        IAddressBook(addressBook).enforceIsProductOwner(msg.sender);
        if (_pricer == address(0)) {
            // Delete
            uint256 lastIndex = _tokens.length - 1;
            address lastToken = _tokens[lastIndex];
            uint256 removedTokenIndex = _tokensIndexes[_token];
            _tokens[removedTokenIndex] = lastToken;
            _tokensIndexes[_token] = 0;
            _tokensIndexes[lastToken] = removedTokenIndex;
            _tokens.pop();
        } else {
            // Add/Update
            require(
                IPricer(_pricer).decimals() == PRICERS_DECIMALS,
                "Treasury: pricer decimals != 8"
            );
            _tokensIndexes[_token] = _tokens.length;
            _tokens.push(_token);
        }
        pricers[_token] = _pricer;
    }

    // ------------------------------------------------------------------------------------
    // ----- PRODUCT OWNER & PROTOCOL ACTIONS  --------------------------------------------
    // ------------------------------------------------------------------------------------

    function withdraw(address _token, uint256 _amount, address _recipient) external {
        IAddressBook _addressBook = IAddressBook(addressBook);
        if (onlyGovernanceWithdrawn) {
            _addressBook.enforceIsProductOwner(msg.sender);
        } else {
            require(
                _addressBook.productOwner() == msg.sender ||
                    _addressBook.stakingStrategies(msg.sender),
                "Treasury: withdraw not authorized!"
            );
        }

        IERC20Metadata(_token).transfer(_recipient, _amount);

        emit Withdraw(msg.sender, _recipient, _token, _amount);
    }

    // ------------------------------------------------------------------------------------
    // ----- VIEW  ------------------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    function tokens() external view returns (address[] memory) {
        return _tokens;
    }

    function usdAmountToToken(uint256 _usdAmount, address _token) public view returns (uint256) {
        IPricer pricer = IPricer(pricers[_token]);
        require(address(pricer) != address(0), "not supported token!");

        (, int256 tokenPrice, , , ) = pricer.latestRoundData();
        return
            (_usdAmount * (10 ** IERC20Metadata(_token).decimals()) * (10 ** PRICERS_DECIMALS)) /
            uint256(tokenPrice);
    }

    function enforceIsSupportedToken(address _token) external view {
        require(pricers[_token] != address(0), "Treasury: unknown token!");
    }
}

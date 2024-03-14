// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { IAddressBook } from "../../interfaces/IAddressBook.sol";
import { IPricer } from "../../interfaces/IPricer.sol";

contract ElctPresale is UUPSUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20Metadata;

    address public addressBook;
    address public elct;
    address public elctPricer;

    uint256 public constant PRICERS_DECIMALS = 8;

    mapping(address token => address pricer) public payTokensPricers;

    function initialize(
        address _addressBook,
        address _elct,
        address _elctPricer,
        address[] calldata _payTokens,
        address[] calldata _payTokensPricers
    ) public initializer {
        require(_addressBook != address(0), "_addressBook is zero!");
        require(_elct != address(0), "_elct is zero!");
        require(_elctPricer != address(0), "_elctPricer is zero!");
        require(_payTokens.length == _payTokensPricers.length, "_payTokens.length!");

        addressBook = _addressBook;
        elct = _elct;
        elctPricer = _elctPricer;
        for (uint256 i; i < _payTokens.length; ++i) {
            _addPayToken(_payTokens[i], _payTokensPricers[i]);
        }
    }

    function buy(
        uint256 _elctAmount,
        address _payToken,
        uint256 _maxPayTokenAmount
    ) external payable nonReentrant {
        require(_elctAmount != 0, "_elctAmount is zero!");
        IERC20Metadata _elct = IERC20Metadata(elct);
        uint256 payTokenAmount = elctAmountToToken(_elctAmount, _payToken);
        require(payTokenAmount > 0, "payTokenAmount is zero!");
        require(payTokenAmount <= _maxPayTokenAmount, "_maxPayTokenAmount!");
        if (_payToken == address(0)) {
            require(msg.value >= payTokenAmount, "value < payTokenAmount");
            uint256 change = msg.value - payTokenAmount;
            if (change > 0) {
                (bool success, ) = msg.sender.call{ value: change }("");
                require(success, "failed to send change!");
            }
        } else {
            IERC20Metadata(_payToken).safeTransferFrom(msg.sender, address(this), payTokenAmount);
        }

        _elct.safeTransfer(msg.sender, _elctAmount);
    }

    function _addPayToken(address _payToken, address _payTokenPricer) internal {
        require(_payTokenPricer != address(0), "_payTokenPricer is zero!");
        require(IPricer(_payTokenPricer).decimals() == PRICERS_DECIMALS, "pricer decimals!");
        (, int256 price, , , ) = IPricer(_payTokenPricer).latestRoundData();
        require(price > 0, "pricer answer is zero!");

        payTokensPricers[_payToken] = _payTokenPricer;
    }

    function addPayToken(address _payToken, address _payTokenPricer) external {
        IAddressBook(addressBook).enforceIsProductOwner(msg.sender);
        _addPayToken(_payToken, _payTokenPricer);
    }

    function deletePayToken(address _payToken) external {
        IAddressBook(addressBook).enforceIsProductOwner(msg.sender);
        require(payTokensPricers[_payToken] != address(0), "pay token not found!");
        delete payTokensPricers[_payToken];
    }

    function withdraw(address _token, uint256 _amount) external {
        IAddressBook(addressBook).enforceIsProductOwner(msg.sender);
        if (_token == address(0)) {
            (bool success, ) = msg.sender.call{ value: _amount }("");
            require(success, "withdraw transfer failed!");
        } else {
            IERC20Metadata(_token).safeTransfer(msg.sender, _amount);
        }
    }

    function elctAmountToToken(uint256 _elctAmount, address _token) public view returns (uint256) {
        IPricer pricer = IPricer(payTokensPricers[_token]);
        require(address(pricer) != address(0), "not supported token!");

        (, int256 tokenPrice, , , ) = pricer.latestRoundData();
        (, int256 elctPrice, , , ) = IPricer(elctPricer).latestRoundData();
        uint256 decimals = _token == address(0) ? 18 : IERC20Metadata(_token).decimals();
        return
            (_elctAmount * uint256(elctPrice) * (10 ** decimals)) /
            uint256(tokenPrice) /
            1e18;
    }

    function _authorizeUpgrade(address) internal view override {
        IAddressBook(addressBook).enforceIsProductOwner(msg.sender);
    }

    constructor() {
        _disableInitializers();
    }
}

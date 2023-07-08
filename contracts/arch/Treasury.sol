// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import { ITreasury } from "./interfaces/ITreasury.sol";
import { IPricer } from "./interfaces/IPricer.sol";
import { GovernanceRole } from "./roles/GovernanceRole.sol";
import { StakingPlatformRole } from "./roles/StakingPlatformRole.sol";
import { ConstantsLib } from "./libs/ConstantsLib.sol";
import { TransferLib } from "./libs/TransferLib.sol";
import "hardhat/console.sol";

contract Treasury is ITreasury, UUPSUpgradeable, GovernanceRole, StakingPlatformRole {
    uint256 public constant PRICERS_DECIMALS = 8;

    mapping(address => address) public pricers;
    address[] internal _tokens;
    mapping(address => uint256) internal _tokensIndexes;

    bool public onlyGovernanceWithdrawn;

    function tokens() external view returns (address[] memory) {
        return _tokens;
    }

    function _authorizeUpgrade(address) internal view override {
        _enforceIsGovernance();
    }

    function setOnlyGovernanceWithdrawn(bool _value) external {
        _enforceIsGovernance();
        onlyGovernanceWithdrawn = _value;
    }

    function initialize(address _governance, address _stakingPlatform) public initializer {
        governance = _governance;
        stakingPlatform = _stakingPlatform;
    }

    function setTokenPricer(address _token, address _pricer) public {
        _enforceIsGovernance();
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

    function enforceIsSupportedToken(address _token) external view {
        require(pricers[_token] != address(0), "Treasury: unknown token!");
    }

    function withdraw(address _token, uint256 _amount, address _recipient) external {
        if (onlyGovernanceWithdrawn) {
            _enforceIsGovernance();
        } else {
            require(
                _isGovernance(msg.sender) || _isStakingPlatform(msg.sender),
                "Treasury: withdraw not authorized!"
            );
        }
        TransferLib.transfer(_token, _recipient, _amount);
    }

    function usdAmountToToken(uint256 _usdAmount, address _token) public view returns (uint256) {
        IPricer pricer = IPricer(pricers[_token]);
        (, int256 tokenPrice, , , ) = pricer.latestRoundData();
        return
            (_usdAmount * (10 ** TransferLib.tokenDecimals(_token)) * (10 ** PRICERS_DECIMALS)) /
            uint256(tokenPrice);
    }
}
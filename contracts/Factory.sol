// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import { GovernanceRole } from "./roles/GovernanceRole.sol";
import { ITreasury } from "./interfaces/ITreasury.sol";
import { IGovernance } from "./interfaces/IGovernance.sol";
import { IFixStakingStrategy } from "./interfaces/IFixStakingStrategy.sol";
import { IFlexStakingStrategy } from "./interfaces/IFlexStakingStrategy.sol";
import { IItem } from "./interfaces/IItem.sol";
import { IPricer } from "./interfaces/IPricer.sol";
import { IGovernance } from "./interfaces/IGovernance.sol";
import { IUUPSUpgradeable } from "./interfaces/IUUPSUpgradeable.sol";

contract Factory is UUPSUpgradeable, GovernanceRole {
    // ------------------------------------------------------------------------------------
    // ----- STORAGE ----------------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    address public itemImplementation;
    address public fixStakingStrategyImplementation;
    address public flexStakingStrategyImplementation;
    address public pricerImplementation;

    // ------------------------------------------------------------------------------------
    // ----- EVENTS -----------------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    event DeployPricer(address indexed pricer, int256 initialPrice, string description);

    event DeployItem(
        address indexed item,
        string name,
        string symbol,
        uint256 price,
        uint256 maxSupply
    );

    event DeployFixStakingStrategy(
        address indexed fixStakingStrategy,
        uint256 _rewardsRate,
        uint256 _lockYears,
        uint256 _yearDeprecationRate
    );

    event DeployFlexStakingStrategy(
        address indexed flexStakingStrategy,
        uint256 _minLockYears,
        uint256 _maxLockYears,
        uint256 _initialMonths,
        uint256 _initialRewardsRate,
        uint256 _yearDeprecationRate
    );

    // ------------------------------------------------------------------------------------
    // ----- DEPLOY & UPGRADE  ------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    function initialize(address _governance) public initializer {
        governance = _governance;
    }

    function _authorizeUpgrade(address) internal view override {
        _enforceIsGovernance();
    }

    // ------------------------------------------------------------------------------------
    // ----- GOVERNANCE ACTIONS  ----------------------------------------------------------
    // ------------------------------------------------------------------------------------

    function setItemImplementation(address _itemImplementation) external {
        _enforceIsGovernance();

        itemImplementation = _itemImplementation;
    }

    function setFixStakingStrategyImplementation(
        address _fixStakingStrategyImplementation
    ) external {
        _enforceIsGovernance();

        fixStakingStrategyImplementation = _fixStakingStrategyImplementation;
    }

    function setFlexStakingStrategyImplementation(
        address _flexStakingStrategyImplementation
    ) external {
        _enforceIsGovernance();

        flexStakingStrategyImplementation = _flexStakingStrategyImplementation;
    }

    function setPricerImplementation(address _pricerImplementation) external {
        _enforceIsGovernance();

        pricerImplementation = _pricerImplementation;
    }

    function deployPricer(
        int256 _initialPrice,
        string calldata _description
    ) external returns (address pricer_) {
        _enforceIsGovernance();

        pricer_ = address(
            new ERC1967Proxy(
                pricerImplementation,
                abi.encodeWithSelector(
                    IPricer.initialize.selector,
                    governance,
                    _initialPrice,
                    _description
                )
            )
        );

        emit DeployPricer(pricer_, _initialPrice, _description);
    }

    function deployItem(
        string calldata _name,
        string calldata _symbol,
        uint256 _price,
        uint256 _maxSupply
    ) external returns (address item_) {
        _enforceIsGovernance();

        item_ = address(
            new ERC1967Proxy(
                itemImplementation,
                abi.encodeWithSelector(
                    IItem.initialize.selector,
                    governance,
                    _name,
                    _symbol,
                    _price,
                    _maxSupply
                )
            )
        );

        emit DeployItem(item_, _name, _symbol, _price, _maxSupply);
    }

    function deployFixStakingStrategy(
        uint256 _rewardsRate,
        uint256 _lockYears,
        uint256 _yearDeprecationRate
    ) external returns (address fixStakingStrategy_) {
        _enforceIsGovernance();

        fixStakingStrategy_ = address(
            new ERC1967Proxy(
                fixStakingStrategyImplementation,
                abi.encodeWithSelector(
                    IFixStakingStrategy.initialize.selector,
                    governance,
                    _rewardsRate,
                    _lockYears,
                    _yearDeprecationRate
                )
            )
        );

        emit DeployFixStakingStrategy(
            fixStakingStrategy_,
            _rewardsRate,
            _lockYears,
            _yearDeprecationRate
        );
    }

    function deployFlexStakingStrategy(
        uint256 _minLockYears,
        uint256 _maxLockYears,
        uint256 _initialMonths,
        uint256 _initialRewardsRate,
        uint256 _yearDeprecationRate
    ) external returns (address flexStakingStrategy_) {
        _enforceIsGovernance();

        flexStakingStrategy_ = address(
            new ERC1967Proxy(
                flexStakingStrategyImplementation,
                abi.encodeWithSelector(
                    IFlexStakingStrategy.initialize.selector,
                    governance,
                    _minLockYears,
                    _maxLockYears,
                    _initialMonths,
                    _initialRewardsRate,
                    _yearDeprecationRate
                )
            )
        );

        emit DeployFlexStakingStrategy(
            flexStakingStrategy_,
            _minLockYears,
            _maxLockYears,
            _initialMonths,
            _initialRewardsRate,
            _yearDeprecationRate
        );
    }
}

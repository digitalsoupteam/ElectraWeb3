// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import { ProductOwnerRole } from "./roles/ProductOwnerRole.sol";
import { ITreasury } from "./interfaces/ITreasury.sol";
import { IGovernance } from "./interfaces/IGovernance.sol";
import { IFixStakingStrategy } from "./interfaces/IFixStakingStrategy.sol";
import { IFlexStakingStrategy } from "./interfaces/IFlexStakingStrategy.sol";
import { IItem } from "./interfaces/IItem.sol";
import { IPricer } from "./interfaces/IPricer.sol";
import { IFactory } from "./interfaces/IFactory.sol";
import { IUUPSUpgradeable } from "./interfaces/IUUPSUpgradeable.sol";

contract Governance is IGovernance, UUPSUpgradeable, ProductOwnerRole {
    // ------------------------------------------------------------------------------------
    // ----- STORAGE ----------------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    address public treasury;
    address public factory;
    mapping(address => bool) public items;
    mapping(address => bool) public stakingStrategies;

    // ------------------------------------------------------------------------------------
    // ----- DEPLOY & UPGRADE  ------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    function initialize(address _prodcutOwner) public initializer {
        productOwner = _prodcutOwner;
    }

    function _authorizeUpgrade(address) internal view override {
        _enforceIsProductOwner();
    }

    // ------------------------------------------------------------------------------------
    // ----- PRODUCT OWNER ACTIONS  -------------------------------------------------------
    // ------------------------------------------------------------------------------------

    function enforceIsItemContract(address _contract) external view {
        require(items[_contract], "only item!");
    }

    function enforceIsStakingStrategyContract(address _contract) external view {
        require(stakingStrategies[_contract], "only item!");
    }

    function addStakingStrategy(address _stakingStrategy) external {
        _enforceIsProductOwner();
        stakingStrategies[_stakingStrategy] = true;
    }

    function deleteStakingStrategy(address _stakingStrategy) external {
        _enforceIsProductOwner();
        delete stakingStrategies[_stakingStrategy];
    }

    function setTreasury(address _treasury) external {
        _enforceIsProductOwner();
        require(treasury == address(0), "Governance: treasury already setted!");

        treasury = _treasury;
    }

    function setFactory(address _factory) external {
        _enforceIsProductOwner();
        require(factory == address(0), "Governance: factory already setted!");

        factory = _factory;
    }

    
    function setItemImplementation(address _itemImplementation) external {
        _enforceIsProductOwner();
        
        IFactory(factory).setItemImplementation(_itemImplementation);
    }

    function setFixStakingStrategyImplementation(
        address _fixStakingStrategyImplementation
    ) external {
        _enforceIsProductOwner();

        IFactory(factory).setFixStakingStrategyImplementation(_fixStakingStrategyImplementation);
    }

    function setFlexStakingStrategyImplementation(
        address _flexStakingStrategyImplementation
    ) external {
        _enforceIsProductOwner();

        IFactory(factory).setFlexStakingStrategyImplementation(_flexStakingStrategyImplementation);
    }

    function setPricerImplementation(address _pricerImplementation) external {
        _enforceIsProductOwner();

        IFactory(factory).setPricerImplementation(_pricerImplementation);
    }

    function withdraw(address _token, uint256 _amount, address _recipient) external {
        _enforceIsProductOwner();

        ITreasury(treasury).withdraw(_token, _amount, _recipient);
    }

    function deposit(address _token, uint256 _amount) external {
        _enforceIsProductOwner();

        IERC20Metadata(_token).transferFrom(msg.sender, treasury, _amount);
    }

    function addToken(address _token, address _pricer) public {
        _enforceIsProductOwner();
        require(ITreasury(treasury).pricers(_token) == address(0), "Governance: token exists!");

        ITreasury(treasury).setTokenPricer(_token, _pricer);
    }

    function addTokenWithCustomPricer(
        address _token,
        int256 _initialPrice,
        string calldata _description
    ) public {
        _enforceIsProductOwner();

        address pricer = IFactory(factory).deployPricer(_initialPrice, _description);

        addToken(_token, pricer);
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

        address newItem = IFactory(factory).deployItem(_name, _symbol, _price, _maxSupply);
        items[newItem] = true;
    }

    function addFixStakingStrategy(
        uint256 _rewardsRate,
        uint256 _lockYears,
        uint256 _yearDeprecationRate
    ) public {
        _enforceIsProductOwner();

        address newSakingStrategy = IFactory(factory).deployFixStakingStrategy(
            _rewardsRate,
            _lockYears,
            _yearDeprecationRate
        );
        stakingStrategies[newSakingStrategy] = true;
    }

    function addFlexStakingStrategy(
        uint256 _minLockYears,
        uint256 _maxLockYears,
        uint256 _initialMonths,
        uint256 _initialRewardsRate,
        uint256 _yearDeprecationRate
    ) public {
        _enforceIsProductOwner();

        address newSakingStrategy = IFactory(factory).deployFlexStakingStrategy(
            _minLockYears,
            _maxLockYears,
            _initialMonths,
            _initialRewardsRate,
            _yearDeprecationRate
        );
        stakingStrategies[newSakingStrategy] = true;
    }

    function setCurrentPriceToPricer(address _pricer, int256 _currentPrice) external {
        _enforceIsProductOwner();

        IPricer(_pricer).setCurrentPrice(_currentPrice);
    }

    function upgradeContract(address _contract, address _implementation) external {
        _enforceIsProductOwner();

        IUUPSUpgradeable(_contract).upgradeTo(_implementation);
    }

    function setFlexStrategyEarningsPeriod(
        address _flexStrategy,
        uint256 _month,
        uint256 _year,
        uint256 _sharedEarnings
    ) external {
        _enforceIsProductOwner();
        IFlexStakingStrategy(_flexStrategy).setEarnings(_month, _year, _sharedEarnings);
    }
}

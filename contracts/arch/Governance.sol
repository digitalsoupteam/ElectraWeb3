// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import { ProductOwnerRole } from "./roles/ProductOwnerRole.sol";
import { ITreasury } from "./interfaces/ITreasury.sol";
import { IStakingPlatform } from "./interfaces/IStakingPlatform.sol";
import { IItemsFactory } from "./interfaces/IItemsFactory.sol";
import { IGovernance } from "./interfaces/IGovernance.sol";
import { IUUPSUpgradeable } from "./interfaces/IUUPSUpgradeable.sol";

contract Governance is IGovernance, UUPSUpgradeable, ProductOwnerRole {
    address public treasury;
    address public stakingPlatform;
    address public itemsFactory;

    function _authorizeUpgrade(address) internal view override {
        _enforceIsProductOwner();
    }

    function initialize(address _prodcutOwner) public initializer {
        productOwner = _prodcutOwner;
    }

    function setTreasury(address _treasury) external {
        _enforceIsProductOwner();
        require(treasury == address(0), "Governance: treasury already setted!");

        treasury = _treasury;
        IStakingPlatform(stakingPlatform).setTreasury(_treasury);
    }

    function setStakingPlatform(address _stakingPlatform) external {
        _enforceIsProductOwner();
        require(stakingPlatform == address(0), "Governance: staking platform already setted!");

        stakingPlatform = _stakingPlatform;
    }

    function setItemsFactory(address _itemsFactory) external {
        _enforceIsProductOwner();
        require(itemsFactory == address(0), "Governance: items factory already setted!");

        itemsFactory = _itemsFactory;
        IStakingPlatform(stakingPlatform).setItemsFactory(_itemsFactory);
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

    function addRewardsStrategy(address _rewardsStartegy) external {
        _enforceIsProductOwner();

        IStakingPlatform(stakingPlatform).addRewardsStrategy(_rewardsStartegy);
    }

    function addItem(string calldata _name, uint256 _price) public {
        _enforceIsProductOwner();

        IItemsFactory(itemsFactory).addItem(_name, _price);
    }

    function stopItemSell(uint256 _itemId) public {
        _enforceIsProductOwner();

        IItemsFactory(itemsFactory).stopItemSell(_itemId);
    }

    function upgradeItemsFactory(address _implementation) external {
        _enforceIsProductOwner();

        IUUPSUpgradeable(itemsFactory).upgradeTo(_implementation);
    }

    function upgradeStakingPlatform(address _implementation) external {
        _enforceIsProductOwner();

        IUUPSUpgradeable(stakingPlatform).upgradeTo(_implementation);
    }

    function upgradeTreasury(address _implementation) external {
        _enforceIsProductOwner();

        IUUPSUpgradeable(treasury).upgradeTo(_implementation);
    }
}

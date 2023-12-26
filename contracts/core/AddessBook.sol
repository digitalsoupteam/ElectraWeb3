// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { MulticallUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/MulticallUpgradeable.sol";

/// @dev This contract is managed by the protocol owner
/// Does not emit any events since they are not required for the protocol to work
contract AddressBook is UUPSUpgradeable, MulticallUpgradeable {
    // ------------------------------------------------------------------------------------
    // ----- STORAGE ----------------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    address public productOwner;
    address public treasury;
    mapping(address => bool) public items;
    mapping(address => bool) public stakingStrategies;

    // ------------------------------------------------------------------------------------
    // ----- DEPLOY & UPGRADE  ------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    constructor() {
        _disableInitializers();
    }

    /// @dev All contracts use a naming convention for function arguments starting with _.
    function initialize(address _prodcutOwner) public initializer {
        productOwner = _prodcutOwner;
    }

    function _authorizeUpgrade(address) internal view override {
        enforceIsProductOwner(msg.sender);
    }

    // ------------------------------------------------------------------------------------
    // ----- PRODUCT OWNER ACTIONS  -------------------------------------------------------
    // ------------------------------------------------------------------------------------

    /// @dev Updates variable productOwner. There is no need to check if the values ​​are identical, 
    /// since the EVM handles this situation itself and does not waste extra gas with the same values
    function setProductOwner(address _newProductOwner) external {
        enforceIsProductOwner(msg.sender);
        productOwner = _newProductOwner;
    }

    function addItem(address _item) external {
        enforceIsProductOwner(msg.sender);
        items[_item] = true;
    }

    function deleteItem(address _item) external {
        enforceIsProductOwner(msg.sender);
        delete items[_item];
    }

    function addStakingStrategy(address _stakingStrategy) external {
        enforceIsProductOwner(msg.sender);
        stakingStrategies[_stakingStrategy] = true;
    }

    function deleteStakingStrategy(address _stakingStrategy) external {
        enforceIsProductOwner(msg.sender);
        delete stakingStrategies[_stakingStrategy];
    }

    function setTreasury(address _treasury) external {
        enforceIsProductOwner(msg.sender);
        require(treasury == address(0), "treasury already setted!");

        treasury = _treasury;
    }

    // ------------------------------------------------------------------------------------
    // ----- VIEW  ------------------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    /// @dev Such functions are used instead of modifiers because: 
    /// they can be reused between contracts, they take up less space in the bytecode
    function enforceIsProductOwner(address _account) public view {
        require(_account == productOwner, "only product owner!");
    }

    function enforceIsItemContract(address _contract) external view {
        require(items[_contract], "only item!");
    }

    function enforceIsStakingStrategyContract(address _contract) external view {
        require(stakingStrategies[_contract], "only staking strategy!");
    }
}

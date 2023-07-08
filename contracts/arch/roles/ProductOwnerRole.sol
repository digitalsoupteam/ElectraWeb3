// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

contract ProductOwnerRole {
    address public productOwner;

    event SetProductOwner(address oldProductOwner, address newProductOwner);

    function _isProductOwner(address _account) internal view returns (bool) {
        return _account == productOwner;
    }

    function _enforceIsProductOwner() internal view {
        require(_isProductOwner(msg.sender), "ProductOwnerRole: not authorized!");
    }

    function setProdcutOwner(address _newProductOwner) external {
        _enforceIsProductOwner();
        require(_newProductOwner != address(0), "ProductOwnerRole: new product owner is zero!");
        
        address oldProductOwner = productOwner;
        productOwner = _newProductOwner;

        emit SetProductOwner(oldProductOwner, _newProductOwner);
    }

    uint256[50] private __gap;
}

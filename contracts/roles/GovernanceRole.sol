// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

contract GovernanceRole {
    address public governance;

    function _isGovernance(address _account) internal view returns(bool) {
        return _account == governance;
    }

    function _enforceIsGovernance() internal view {
        require(_isGovernance(msg.sender), "GovernanceRole: not authorized!");
    }

    uint256[50] private __gap;
}

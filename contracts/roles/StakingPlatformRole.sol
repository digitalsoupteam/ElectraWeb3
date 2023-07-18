// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

contract StakingPlatformRole {
    address public stakingPlatform;

    function _isStakingPlatform(address _account) internal view returns(bool) {
        return _account == stakingPlatform;
    }

    function _enforceIsStakingPlatform() internal view {
        require(_isStakingPlatform(msg.sender), "StakingPlatformRole: not authorized!");
    }

    uint256[50] private __gap;
}

// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { ConstantsLib } from "./ConstantsLib.sol";
// import "hardhat/console.sol";

library TransferLib {
    function transfer(address _token, address _recipient, uint256 _amount) internal {
        if (_token == ConstantsLib.BNB_PLACEHOLDER) {
            // console.log("_amount", _amount);
            // console.log("balance", address(this).balance);
            (bool success, ) = _recipient.call{ value: _amount }("");
            // console.log("balance", address(this).balance);
            require(success, "TransferLib: failed transfer BNB!");
        } else {
            bool success = IERC20Metadata(_token).transfer(_recipient, _amount);
            require(success, "TransferLib: failed transfer!");
        }
    }

    function transferFrom(address _token, address _from, address _to, uint256 _amount) internal {
        if (_token == ConstantsLib.BNB_PLACEHOLDER) {
            // console.log("msg.value", msg.value);
            // console.log("_amount", _amount);
            // console.log("bLnce", address(this).balance);
            require(msg.value >= _amount, "TransferLib: an insufficient BNB amount!");
            uint256 change = msg.value - _amount;
            if (_to != address(this)) {
                (bool success, ) = _to.call{ value: _amount }("");
                require(success, "TransferLib2: failed transfer BNB!");
            }
            if (change > 0) {
                (bool success, ) = _from.call{ value: change }("");
                require(success, "TransferLib: failed transfer change!");
            }
        } else {
            (bool success) = IERC20Metadata(_token).transferFrom(_from, _to, _amount);
            require(success, "TransferLib: failed transferFrom!");
        }
    }

    function tokenDecimals(address _token) internal view returns (uint8) {
        return _token == ConstantsLib.BNB_PLACEHOLDER ? 18 : IERC20Metadata(_token).decimals();
    }
}

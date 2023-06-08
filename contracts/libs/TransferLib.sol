// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

library TransferLib {
    address internal constant BNB_PLACEHOLDER = address(0);

    function transfer(address _token, uint256 _amount, address _recipient) internal {
        if (_token == BNB_PLACEHOLDER) {
            (bool success, ) = _recipient.call{ value: _amount }("");
            require(success, "TransferLib: failed bnb transfer!");
        } else {
            IERC20Metadata(_token).transfer(_recipient, _amount);
        }
    }

    function transferFrom(address _token, uint256 _amount, address _from, address _to) internal {
        if (_token == BNB_PLACEHOLDER) {
            require(msg.value >= _amount, "TransferLib: an insufficient amount bnb!");
            uint256 change = msg.value - _amount;
            if (change > 0) {
                (bool success, ) = _from.call{ value: change }("");
                require(success, "TransferLib: failed transfer change!");
            }
        } else {
            IERC20Metadata tokenForPay = IERC20Metadata(_token);
            uint256 tokenBalanceBefore = tokenForPay.balanceOf(_to);
            tokenForPay.transferFrom(_from, _to, _amount);
            uint256 tokenBalanceAfter = tokenForPay.balanceOf(_to);
            require(
                tokenBalanceAfter - tokenBalanceBefore == _amount,
                "TransferLib: failed transfer token!"
            );
        }
    }
}

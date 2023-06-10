// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

library TransferLib {
    
    function getCurrentDate() internal view returns (uint256 year, uint256 month, uint256 day) {
        return timestampToDate(block.timestamp);
    }

    function timestampToDate(uint256 _timestamp) internal view returns (uint256 year, uint256 month, uint256 day) {
        unchecked {
            int256 OFFSET19700101 = 2440588;
            int256 __days = int256(_timestamp / 1 days);

            int256 L = __days + 68569 + OFFSET19700101;
            int256 N = (4 * L) / 146097;
            L = L - (146097 * N + 3) / 4;
            int256 _year = (4000 * (L + 1)) / 1461001;
            L = L - (1461 * _year) / 4 + 31;
            int256 _month = (80 * L) / 2447;
            int256 _day = L - (2447 * _month) / 80;
            L = _month / 11;
            _month = _month + 2 - 12 * L;
            _year = 100 * (N - 49) + _year + L;

            year = uint256(_year);
            month = uint256(_month);
            day = uint256(_day);
        }
    }

     function getMonthTimestamp(uint256 year, uint256 month) internal pure returns (uint256) {
        require(year >= 1970);
        int256 OFFSET19700101 = 2440588;
        int256 _year = int256(year);
        int256 _month = int256(month);
        int256 _day = int256(1);

        int256 __days = _day - 32075 + (1461 * (_year + 4800 + (_month - 14) / 12)) / 4
            + (367 * (_month - 2 - ((_month - 14) / 12) * 12)) / 12
            - (3 * ((_year + 4900 + (_month - 14) / 12) / 100)) / 4 - OFFSET19700101;

        return uint256(__days) * 1 days;
    }

}

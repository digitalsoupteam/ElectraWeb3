// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

library TimestampLib {
    int256 internal constant OFFSET19700101 = 2440588;

    function getCurrentDate() internal view returns (uint256 year, uint256 month, uint256 day) {
        return timestampToDate(block.timestamp);
    }

    function timestampToDate(
        uint256 _timestamp
    ) internal pure returns (uint256 year, uint256 month, uint256 day) {
        unchecked {
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

    function getMonthTimestamp(uint256 _year, uint256 _month) internal pure returns (uint256) {
        return dateToTimestamp(_year, _month, 1);
    }

    function getStartDayTimestamp(uint256 _timestamp) internal pure returns (uint256) {
        return (_timestamp / 1 days) * 1 days;
    }

    function dateToTimestamp(
        uint256 _year,
        uint256 _month,
        uint256 _day
    ) internal pure returns (uint256) {
        require(_year >= 1970, "TimestampLib: year can not be less 1970!");
        int256 year = int256(_year);
        int256 month = int256(_month);
        int256 day = int256(_day);

        int256 daysCount = day -
            32075 +
            (1461 * (year + 4800 + (month - 14) / 12)) /
            4 +
            (367 * (month - 2 - ((month - 14) / 12) * 12)) /
            12 -
            (3 * ((year + 4900 + (month - 14) / 12) / 100)) /
            4 -
            OFFSET19700101;

        return uint256(daysCount) * 1 days;
    }
}

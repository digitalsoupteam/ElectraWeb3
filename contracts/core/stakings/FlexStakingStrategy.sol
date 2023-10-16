// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import { ITreasury } from "../../interfaces/ITreasury.sol";
import { IAddressBook } from "../../interfaces/IAddressBook.sol";
import { IItem } from "../../interfaces/IItem.sol";
import { IStakingStrategy } from "../../interfaces/IStakingStrategy.sol";
import { DateTimeLib } from "../../utils/DateTimeLib.sol";

contract FlexStakingStrategy is IStakingStrategy, ReentrancyGuardUpgradeable, UUPSUpgradeable {
    // ------------------------------------------------------------------------------------
    // ----- STORAGE ----------------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    address public addressBook;
    uint256 public minLockYears;
    uint256 public maxLockYears;
    uint256 public initialMonths;
    uint256 public initialRewardsRate;
    uint256 public yearDeprecationRate;
    uint256 public minMonthsCount;
    uint256 public maxMonthsCount;

    mapping(uint256 year => mapping(uint256 month => uint256)) public earnings;
    mapping(uint256 year => mapping(uint256 month => uint256 depositToRemove))
        public depositsToRemove;
    mapping(uint256 year => mapping(uint256 month => uint256 deposit)) public deposits;
    uint256 public lastUpdatedTimestamp;

    mapping(address item => mapping(uint256 tokenId => bool)) public isStakedToken;
    mapping(address item => mapping(uint256 tokenId => uint256)) public initialTimestamp;
    mapping(address item => mapping(uint256 tokenId => uint256)) public startStakingTimestamp;
    mapping(address item => mapping(uint256 tokenId => uint256)) public itemsPrice;
    mapping(address item => mapping(uint256 tokenId => uint256)) public claimedPeriodsCount;
    mapping(address item => mapping(uint256 tokenId => uint256)) public finalTimestamp;
    mapping(address item => mapping(uint256 tokenId => uint256)) public remainder;
    mapping(address item => mapping(uint256 tokenId => uint256)) public withdrawnRewards;

    struct DepositsDate {
        uint256 finalYear;
        uint256 finalMonth;
        uint256 prevFinalYear;
        uint256 prevFinalMonth;
    }
    mapping(address item => mapping(uint256 tokenId => DepositsDate)) public depostitsDate;

    uint256 public lastUpdatedEarningsYear;
    uint256 public lastUpdatedEarningsMonth;

    // ------------------------------------------------------------------------------------
    // ----- EVENTS  ----------------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    event UpdateDeposits(uint256 year, uint256 month, uint256 deposits);
    event SetEarnings(uint256 year, uint256 month, uint256 earnings);
    event Stake(
        address itemAddress,
        uint256 itemId,
        address itemOwner,
        uint256 itemsPrice,
        uint256 initialTimestamp,
        uint256 startStakingTimetsmap,
        uint256 finalTimestamp,
        uint256 remainder
    );
    event Claim(
        address itemAddress,
        uint256 itemId,
        address itemOwner,
        uint256 rewards,
        uint256 claimedPeriods,
        address withdrawToken,
        uint256 withdrawTokenAmount
    );
    event Sell(
        address itemAddress,
        uint256 itemId,
        address itemOwner,
        uint256 sellPrice,
        address withdrawToken,
        uint256 withdrawTokenAmount
    );

    // ------------------------------------------------------------------------------------
    // ----- DEPLOY & UPGRADE  ------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    function initialize(
        address _addressBook,
        uint256 _minLockYears,
        uint256 _maxLockYears,
        uint256 _initialMonths,
        uint256 _initialRewardsRate,
        uint256 _yearDeprecationRate
    ) public initializer {
        addressBook = _addressBook;
        minLockYears = _minLockYears;
        maxLockYears = _maxLockYears;
        initialMonths = _initialMonths;
        initialRewardsRate = _initialRewardsRate;
        yearDeprecationRate = _yearDeprecationRate;

        (uint256 initialYear, uint256 initialMonth, ) = DateTimeLib.timestampToDate(
            DateTimeLib.subMonths(_blockTimestamp(), 1)
        );
        lastUpdatedTimestamp = DateTimeLib.timestampFromDate(initialYear, initialMonth, 1);

        maxMonthsCount = 12 * _maxLockYears + 1;
        minMonthsCount = 12 * _minLockYears + 1;
    }

    function _authorizeUpgrade(address) internal view override {
        IAddressBook(addressBook).enforceIsProductOwner(msg.sender);
    }

    // ------------------------------------------------------------------------------------
    // -----  PRODUCT OWNER ACTIONS  ------------------------------------------------------
    // ------------------------------------------------------------------------------------

    function setEarnings(uint256 _year, uint256 _month, uint256 _formatedEarning) external {
        IAddressBook(addressBook).enforceIsProductOwner(msg.sender);
        require(_formatedEarning > 0, "earnings cannot be zero!");

        uint256 earningsTimestamp = DateTimeLib.timestampFromDate(_year, _month, 1);
        require(
            earningsTimestamp <= lastUpdatedTimestamp,
            "cannot set earnings for an unexpired period!"
        );
        uint256 _earnings = _formatedEarning * 1e18;
        earnings[_year][_month] = _earnings;

        lastUpdatedEarningsYear = _year;
        lastUpdatedEarningsMonth = _month;

        emit SetEarnings(_year, _month, _earnings);
    }

    function updateDeposits() public {
        IAddressBook(addressBook).enforceIsProductOwner(msg.sender);

        uint256 _lastUpdatedTimestamp = lastUpdatedTimestamp;
        uint256 diffMonths = DateTimeLib.diffMonths(_lastUpdatedTimestamp, _blockTimestamp());
        if (diffMonths == 0) return;
        uint256 monthsToUpdate = diffMonths - 1;
        if (monthsToUpdate == 0) return;
        for (uint256 i; i < monthsToUpdate; ++i) {
            (uint256 prevYear, uint256 prevMonth, ) = DateTimeLib.timestampToDate(
                _lastUpdatedTimestamp
            );
            _lastUpdatedTimestamp = DateTimeLib.addMonths(_lastUpdatedTimestamp, 1);
            (uint256 year, uint256 month, ) = DateTimeLib.timestampToDate(_lastUpdatedTimestamp);
            uint256 newDeposits = deposits[year][month] +
                deposits[prevYear][prevMonth] -
                depositsToRemove[year][month];
            deposits[year][month] = newDeposits;

            emit UpdateDeposits(year, month, newDeposits);
        }
        lastUpdatedTimestamp = _lastUpdatedTimestamp;
    }

    // ------------------------------------------------------------------------------------
    // -----  PROTOCOL ACTIONS  -----------------------------------------------------------
    // ------------------------------------------------------------------------------------

    function stake(address _itemAddress, uint256 _itemId, bytes memory) external {
        IAddressBook(addressBook).enforceIsItemContract(msg.sender);

        // Initial data
        isStakedToken[_itemAddress][_itemId] = true;
        uint256 _initialTimestamp = _blockTimestamp();
        initialTimestamp[_itemAddress][_itemId] = _initialTimestamp;
        (uint256 year, uint256 month, uint256 initialDay) = DateTimeLib.timestampToDate(
            _initialTimestamp
        );

        uint256 _startStakingTimestamp = DateTimeLib.timestampFromDate(year, month, 1);
        startStakingTimestamp[_itemAddress][_itemId] = _startStakingTimestamp;

        uint256 _itemsPrice = IItem(_itemAddress).price();
        itemsPrice[_itemAddress][_itemId] = _itemsPrice;

        // Remainder
        uint256 daysInStartMonth = DateTimeLib.getDaysInMonth(_startStakingTimestamp);
        uint256 ratio = (1e18 * initialDay) / (daysInStartMonth + 1);
        uint256 _remainder = (_itemsPrice * ratio) / 1e18;
        remainder[_itemAddress][_itemId] = _remainder;
        // Final date
        uint256 _finalTimestamp = DateTimeLib.addMonths(_startStakingTimestamp, maxMonthsCount);
        finalTimestamp[_itemAddress][_itemId] = _finalTimestamp;
        // Earnings date
        uint256 earningsTimestamp = DateTimeLib.addMonths(_startStakingTimestamp, initialMonths);
        (uint256 earningsYear, uint256 earningsMonth, ) = DateTimeLib.timestampToDate(
            earningsTimestamp
        );
        // Next earnings date
        (uint256 nextEarningsYear, uint256 nextEarningsMonth, ) = DateTimeLib.timestampToDate(
            DateTimeLib.addMonths(earningsTimestamp, 1)
        );
        // Prev final date
        (uint256 prevFinalYear, uint256 prevFinalMonth, ) = DateTimeLib.timestampToDate(
            DateTimeLib.subMonths(_finalTimestamp, 1)
        );
        // Final date
        (uint256 finalYear, uint256 finalMonth, ) = DateTimeLib.timestampToDate(_finalTimestamp);

        // Set deposits
        deposits[earningsYear][earningsMonth] += _itemsPrice - _remainder;
        deposits[nextEarningsYear][nextEarningsMonth] += _remainder;
        // Set deposits to remove
        depositsToRemove[prevFinalYear][prevFinalMonth] += _itemsPrice - _remainder;
        depositsToRemove[finalYear][finalMonth] += _remainder;
        depostitsDate[_itemAddress][_itemId] = DepositsDate(
            finalYear,
            finalMonth,
            prevFinalYear,
            prevFinalMonth
        );

        address _itemOwner = IERC721(_itemAddress).ownerOf(_itemId);

        emit Stake(
            _itemAddress,
            _itemId,
            _itemOwner,
            _itemsPrice,
            _initialTimestamp,
            _startStakingTimestamp,
            _finalTimestamp,
            _remainder
        );
    }

    // ------------------------------------------------------------------------------------
    // ----- USER ACTIONS  ----------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    function claim(address _itemAddress, uint256 _itemId, address _withdrawToken) external {
        address _itemOwner = IERC721(_itemAddress).ownerOf(_itemId);
        require(msg.sender == _itemOwner, "only item owner!");
        _enforceIsStakedToken(_itemAddress, _itemId);

        (uint256 rewards, uint256 claimedPeriods) = estimateRewards(_itemAddress, _itemId);
        require(rewards > 0, "rewards!");

        withdrawnRewards[_itemAddress][_itemId] += rewards;
        claimedPeriodsCount[_itemAddress][_itemId] += claimedPeriods;

        // Withdraw
        address _treasury = IAddressBook(addressBook).treasury();
        uint256 withdrawTokenAmount = ITreasury(_treasury).usdAmountToToken(
            rewards,
            _withdrawToken
        );
        ITreasury(_treasury).withdraw(_withdrawToken, withdrawTokenAmount, msg.sender);

        emit Claim(
            _itemAddress,
            _itemId,
            _itemOwner,
            rewards,
            claimedPeriods,
            _withdrawToken,
            withdrawTokenAmount
        );
    }

    function sell(address _itemAddress, uint256 _itemId, address _withdrawToken) external {
        address _itemOwner = IERC721(_itemAddress).ownerOf(_itemId);
        require(msg.sender == _itemOwner, "only item owner!");
        _enforceIsStakedToken(_itemAddress, _itemId);

        require(canSell(_itemAddress, _itemId), "can't sell!");

        uint256 currentTimestamp = _blockTimestamp();
        (uint256 currentYear, uint256 currentMonth, ) = DateTimeLib.timestampToDate(
            currentTimestamp
        );

        uint256 _finalTimestamp = finalTimestamp[_itemAddress][_itemId];

        uint256 sellTimestamp = DateTimeLib.subMonths(currentTimestamp, 1);
        if (sellTimestamp > _finalTimestamp) sellTimestamp = _finalTimestamp;
        (uint256 sellYear, uint256 sellMonth, ) = DateTimeLib.timestampToDate(sellTimestamp);

        uint256 diffMonths = DateTimeLib.diffMonths(sellTimestamp, _finalTimestamp);

        uint256 _remainder = remainder[_itemAddress][_itemId];
        DepositsDate memory d = depostitsDate[_itemAddress][_itemId];
        uint256 _itemsPrice = itemsPrice[_itemAddress][_itemId];

        if (diffMonths == 0) {
            // final
            depositsToRemove[sellYear][sellMonth] += _remainder;
        } else if (diffMonths == 1) {
            // prev final
            depositsToRemove[d.finalYear][d.finalMonth] += _itemsPrice;
        } else {
            // early
            depositsToRemove[currentYear][currentMonth] += _itemsPrice;
        }
        depositsToRemove[d.prevFinalYear][d.prevFinalMonth] -= _itemsPrice - _remainder;
        depositsToRemove[d.finalYear][d.finalMonth] -= _remainder;

        uint256 sellPrice = estimateSell(_itemAddress, _itemId);

        withdrawnRewards[_itemAddress][_itemId] += sellPrice;

        address _treasury = IAddressBook(addressBook).treasury();
        uint256 withdrawTokenAmount = ITreasury(_treasury).usdAmountToToken(
            sellPrice,
            _withdrawToken
        );
        require(withdrawTokenAmount > 0, "zero amount!");

        IItem(_itemAddress).burn(_itemId);
        ITreasury(_treasury).withdraw(_withdrawToken, withdrawTokenAmount, msg.sender);

        emit Sell(
            _itemAddress,
            _itemId,
            _itemOwner,
            sellPrice,
            _withdrawToken,
            withdrawTokenAmount
        );
    }

    // ------------------------------------------------------------------------------------
    // ----- VIEW  ------------------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    function stakingType() external pure returns (string memory) {
        return "flex";
    }

    function currentPeriod() external view returns (uint256 year_, uint256 month_, uint256 day_) {
        return timestampPeriod(_blockTimestamp());
    }

    function timestampPeriod(
        uint256 _timestamp
    ) public pure returns (uint256 year_, uint256 month_, uint256 day_) {
        (year_, month_, day_) = DateTimeLib.timestampToDate(_timestamp);
    }

    function claimTimestamp(
        address _itemAddress,
        uint256 _itemId,
        uint256 _monthsCount
    ) external view returns (uint256) {
        uint256 _finalTimestamp = finalTimestamp[_itemAddress][_itemId];
        uint256 _startStakingTimestamp = startStakingTimestamp[_itemAddress][_itemId];
        uint256 _nextClaimTimestamp = DateTimeLib.addMonths(_startStakingTimestamp, _monthsCount);
        if (_nextClaimTimestamp > _finalTimestamp) _nextClaimTimestamp = _finalTimestamp;
        return _nextClaimTimestamp;
    }

    function getAllExpiredMoths(
        address _itemAddress,
        uint256 _itemId
    ) public view returns (uint256) {
        uint256 _startStakingTimestamp = startStakingTimestamp[_itemAddress][_itemId];
        uint256 _maxMonthsCount = maxMonthsCount;
        uint256 allExpiredMonths = DateTimeLib.diffMonths(_startStakingTimestamp, _blockTimestamp());
        if (allExpiredMonths > _maxMonthsCount) allExpiredMonths = _maxMonthsCount;
        return allExpiredMonths;
    }

    function estimateRewards(
        address _itemAddress,
        uint256 _itemId
    ) public view returns (uint256 rewards_, uint256 claimedPeriods_) {
        uint256 _startStakingTimestamp = startStakingTimestamp[_itemAddress][_itemId];
        uint256 _itemsPrice = itemsPrice[_itemAddress][_itemId];
        uint256 _claimedPeriodsCount = claimedPeriodsCount[_itemAddress][_itemId];
        uint256 _remainder = remainder[_itemAddress][_itemId];
        uint256 _maxMonthsCount = maxMonthsCount;
        uint256 _initialMonths = initialMonths;
        uint256 _initialRewardsRate = initialRewardsRate;

        uint256 allExpiredMonths = getAllExpiredMoths(_itemAddress, _itemId);

        for (uint256 i = _claimedPeriodsCount; i < allExpiredMonths; ++i) {
            if (i <= _initialMonths) {
                uint256 initialItemsPrice = _itemsPrice;
                if (i == 0) {
                    initialItemsPrice = _itemsPrice - _remainder;
                } else if (i == _initialMonths) {
                    initialItemsPrice = _remainder;
                }
                rewards_ += (initialItemsPrice * _initialRewardsRate) / 10000;
                if (i < _initialMonths) {
                    ++claimedPeriods_;
                    continue;
                }
            }

            (uint256 year, uint256 month, ) = DateTimeLib.timestampToDate(
                DateTimeLib.addMonths(_startStakingTimestamp, i)
            );

            uint256 _earnings = earnings[year][month];
            if (_earnings == 0) break;

            uint256 earningsItemsPrice = _itemsPrice;
            if (i == _initialMonths) {
                earningsItemsPrice = _itemsPrice - _remainder;
            } else if (i == _maxMonthsCount - 1) {
                earningsItemsPrice = _remainder;
            }

            rewards_ += (earningsItemsPrice * _earnings) / deposits[year][month];
            ++claimedPeriods_;
        }
    }

    function canSell(address _itemAddress, uint256 _itemId) public view returns (bool) {
        uint256 _claimedPeriodsCount = claimedPeriodsCount[_itemAddress][_itemId];
        return
            _claimedPeriodsCount >= minMonthsCount &&
            _claimedPeriodsCount == getAllExpiredMoths(_itemAddress, _itemId);
    }

    function estimateSell(address _itemAddress, uint256 _itemId) public view returns (uint256) {
        uint256 allExpiredMonths = getAllExpiredMoths(_itemAddress, _itemId);
        if (allExpiredMonths < minMonthsCount) return 0;
        --allExpiredMonths; // sub additional splited month

        uint256 _itemsPrice = itemsPrice[_itemAddress][_itemId];
        uint256 deprecation = (_itemsPrice * allExpiredMonths * yearDeprecationRate) / 12 / 10000;

        if (deprecation > _itemsPrice) return 0;
        return _itemsPrice - deprecation;
    }

    function lastUpdatedEarningsPeriod() external view returns (uint256 year_, uint256 month_) {
        year_ = lastUpdatedEarningsYear;
        month_ = lastUpdatedEarningsMonth;
    }

    function _enforceIsStakedToken(address _itemAddress, uint256 _itemId) internal view {
        require(isStakedToken[_itemAddress][_itemId], "only staked token");
    }

    function _blockTimestamp() internal view returns (uint256) {
        return block.timestamp;
    }
}

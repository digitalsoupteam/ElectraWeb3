// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import { ITreasury } from "../../interfaces/ITreasury.sol";
import { IAddressBook } from "../../interfaces/IAddressBook.sol";
import { IItem } from "../../interfaces/IItem.sol";
import { IStakingStrategy } from "../../interfaces/IStakingStrategy.sol";
// import { DateTimeLib } from "../../utils/DateTimeLib.sol";
import "hardhat/console.sol";

contract FlexStakingStrategy is IStakingStrategy, ReentrancyGuardUpgradeable, UUPSUpgradeable {
    // ------------------------------------------------------------------------------------
    // ----- CONSTANTS --------------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    uint256 public constant REWARDS_PERIOD = 30 days;
    uint256 public constant SEED_PERIOD = 1;

    // ------------------------------------------------------------------------------------
    // ----- STORAGE ----------------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    uint256 public seedPeriodTimestamp;

    address public addressBook;
    uint256 public minLockYears;
    uint256 public maxLockYears;
    uint256 public initialMonths;
    uint256 public initialRewardsRate;
    uint256 public yearDeprecationRate;

    mapping(uint256 period => uint256) public earnings;
    mapping(uint256 period => uint256) public depositsToRemove;
    mapping(uint256 period => uint256) public deposits;
    uint256 public lastUpdatedTimestamp;
    uint256 public lastUpdatedPeriod;

    mapping(address item => mapping(uint256 tokenId => uint256)) public initialTimestamp;
    mapping(address item => mapping(uint256 tokenId => uint256)) public lastClaimTimestamp;
    mapping(address item => mapping(uint256 tokenId => uint256)) public startSellTimestamp;
    mapping(address item => mapping(uint256 tokenId => uint256)) public finalTimestamp;
    mapping(address item => mapping(uint256 tokenId => uint256)) public remainder;
    mapping(address item => mapping(uint256 tokenId => uint256)) public maxClaimedMonths;
    mapping(address item => mapping(uint256 tokenId => uint256)) public withdrawnRewards;

    struct DepositsDate {
        uint256 finalYear;
        uint256 finalMonth;
        uint256 prevFinalYear;
        uint256 prevFinalMonth;
    }
    mapping(address item => mapping(uint256 tokenId => DepositsDate)) public depostitsDate;

    // ------------------------------------------------------------------------------------
    // ----- EVENTS  ----------------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    event UpdateDeposits(uint256 period, uint256 deposits);
    event SetEarnings(uint256 period, uint256 earnings);

    // ------------------------------------------------------------------------------------
    // ----- DEPLOY & UPGRADE  ------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    function initialize(
        address _addressBook,
        uint256 _minLockYears,
        uint256 _maxLockYears,
        uint256 _initialMonths,
        uint256 _initialRewardsRate,
        uint256 _yearDeprecationRate,
        uint256 _seedPeriodTimestamp
    ) public initializer {
        addressBook = _addressBook;
        minLockYears = _minLockYears;
        maxLockYears = _maxLockYears;
        initialMonths = _initialMonths;
        initialRewardsRate = _initialRewardsRate;
        yearDeprecationRate = _yearDeprecationRate;
        seedPeriodTimestamp = _seedPeriodTimestamp;

        lastUpdatedPeriod = SEED_PERIOD;

        // (uint256 initialYear, uint256 initialMonth, ) = DateTimeLib.timestampToDate(
        //     DateTimeLib.subMonths(block.timestamp, 1)
        // );
        // lastUpdatedTimestamp = DateTimeLib.timestampFromDate(initialYear, initialMonth, 1);
    }

    function _authorizeUpgrade(address) internal view override {
        IAddressBook(addressBook).enforceIsProductOwner(msg.sender);
    }

    // ------------------------------------------------------------------------------------
    // -----  PRODUCT OWNER ACTIONS  ------------------------------------------------------
    // ------------------------------------------------------------------------------------

    function getPeriod(uint256 _timestamp) public view returns(uint256) {
        return (_timestamp - seedPeriodTimestamp) / REWARDS_PERIOD + SEED_PERIOD;
    }
    
    function currentPeriod() public view returns(uint256) {
        return getPeriod(block.timestamp);
    }
    
    function setEarnings(uint256 _period, uint256 _formatedEarning) external {
        IAddressBook(addressBook).enforceIsProductOwner(msg.sender);
        require(_formatedEarning > 0, "earnings cannot be zero!");

        require(
            _period < currentPeriod(),
            "cannot set earnings for an unexpired period!"
        );
        uint256 _earnings = _formatedEarning * 1e18;
        earnings[_period] = _earnings;

        emit SetEarnings(_period, _earnings);
    }

    function updateDeposits() public {
        IAddressBook(addressBook).enforceIsProductOwner(msg.sender);

        uint256 _lastUpdatedPeriod = lastUpdatedPeriod;
        uint256 _currentPeriod = currentPeriod();

        for (uint256 period = _lastUpdatedPeriod; period < _currentPeriod; ++period) {
            uint256 newDeposits = deposits[period] +
                deposits[period - 1] -
                depositsToRemove[period];
            deposits[period] = newDeposits;

            emit UpdateDeposits(period, newDeposits);
        }
        _lastUpdatedPeriod = _currentPeriod - 1;
    }

    // ------------------------------------------------------------------------------------
    // -----  PROTOCOL ACTIONS  -----------------------------------------------------------
    // ------------------------------------------------------------------------------------

    function stake(address _itemAddress, uint256 _itemId, bytes memory) external {
        IAddressBook(addressBook).enforceIsItemContract(msg.sender);

        // Initial data
        uint256 _initialTimestamp = block.timestamp;
        initialTimestamp[_itemAddress][_itemId] = _initialTimestamp;
        lastClaimTimestamp[_itemAddress][_itemId] = _initialTimestamp;
        startSellTimestamp[_itemAddress][_itemId] = _initialTimestamp + minLockYears * 12 * REWARDS_PERIOD;
        maxClaimedMonths[_itemAddress][_itemId] = 12 * maxLockYears + 1;

        // Earnings date
        uint256 earningsTimestamp = DateTimeLib.addMonths(_initialTimestamp, initialMonths);
        uint256 daysInStartMonth = DateTimeLib.getDaysInMonth(earningsTimestamp);
        (uint256 earningsYear, uint256 earningsMonth, uint256 earningsDay) = DateTimeLib
            .timestampToDate(earningsTimestamp);

        // Remainder
        uint256 ratio = (1e18 * earningsDay) / (daysInStartMonth + 1);
        uint256 totalPrice = IItem(_itemAddress).tokenPrice(_itemId);
        uint256 _remainder = (totalPrice * ratio) / 1e18;
        remainder[_itemAddress][_itemId] = _remainder;

        // Final date
        uint256 _finalTimestamp = DateTimeLib.addMonths(
            DateTimeLib.addYears(_initialTimestamp, maxLockYears),
            1
        );
        finalTimestamp[_itemAddress][_itemId] = _finalTimestamp;

        // Set deposits
        deposits[earningsYear][earningsMonth] += totalPrice - _remainder;
        (uint256 nextEarningsYear, uint256 nextEarningsMonth, ) = DateTimeLib.timestampToDate(
            DateTimeLib.addMonths(earningsTimestamp, 1)
        );
        deposits[nextEarningsYear][nextEarningsMonth] += _remainder;
        // Set deposits to remove
        (uint256 prevFinalYear, uint256 prevFinalMonth, ) = DateTimeLib.timestampToDate(
            DateTimeLib.subMonths(_finalTimestamp, 1)
        );
        depositsToRemove[prevFinalYear][prevFinalMonth] += totalPrice - _remainder;
        (uint256 finalYear, uint256 finalMonth, ) = DateTimeLib.timestampToDate(_finalTimestamp);
        depositsToRemove[finalYear][finalMonth] += _remainder;
        depostitsDate[_itemAddress][_itemId] = DepositsDate(
            finalYear,
            finalMonth,
            prevFinalYear,
            prevFinalMonth
        );
    }

    // ------------------------------------------------------------------------------------
    // ----- USER ACTIONS  ----------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    function claim(address _itemAddress, uint256 _itemId, address _withdrawToken) external {
        _enforceIsTokenOwner(_itemAddress, _itemId);

        uint256 rewards = estimateRewards(_itemAddress, _itemId);
        require(rewards > 0, "rewards!");

        // Update claim timestamp
        uint256 _initialTimestamp = initialTimestamp[_itemAddress][_itemId];
        uint256 allExpiredMonths = DateTimeLib.diffMonths(_initialTimestamp, block.timestamp);
        lastClaimTimestamp[_itemAddress][_itemId] = DateTimeLib.addMonths(
            _initialTimestamp,
            allExpiredMonths
        );

        withdrawnRewards[_itemAddress][_itemId] += rewards;

        // Withdraw
        address _treasury = IAddressBook(addressBook).treasury();
        uint256 withdrawTokenAmount = ITreasury(_treasury).usdAmountToToken(
            rewards,
            _withdrawToken
        );
        ITreasury(_treasury).withdraw(_withdrawToken, withdrawTokenAmount, msg.sender);
    }

    function sell(address _itemAddress, uint256 _itemId, address _withdrawToken) external {
        _enforceIsTokenOwner(_itemAddress, _itemId);
        require(canSell(_itemAddress, _itemId), "can't sell!");

        // Get sell timestamp
        uint256 _finalTimestamp = finalTimestamp[_itemAddress][_itemId];
        uint256 currentTimestamp = block.timestamp;

        uint256 sellTimestamp = DateTimeLib.subMonths(currentTimestamp, 1);
        if (sellTimestamp > _finalTimestamp) sellTimestamp = _finalTimestamp;

        uint256 diffMonths = DateTimeLib.diffMonths(sellTimestamp, _finalTimestamp);

        uint256 _remainder = remainder[_itemAddress][_itemId];
        DepositsDate memory d = depostitsDate[_itemAddress][_itemId];
        uint256 totalPrice = IItem(_itemAddress).tokenPrice(_itemId);

        (uint256 currentYear, uint256 currentMonth, ) = DateTimeLib.timestampToDate(
            currentTimestamp
        );

        (uint256 sellYear, uint256 sellMonth, ) = DateTimeLib.timestampToDate(sellTimestamp);
        if (diffMonths == 0) {
            // final
            depositsToRemove[sellYear][sellMonth] += _remainder;
        } else if (diffMonths == 1) {
            // prev final
            depositsToRemove[d.finalYear][d.finalMonth] += totalPrice;
        } else {
            // early
            depositsToRemove[currentYear][currentMonth] += totalPrice;
        }
        depositsToRemove[d.prevFinalYear][d.prevFinalMonth] -= totalPrice - _remainder;
        depositsToRemove[d.finalYear][d.finalMonth] -= _remainder;

        uint256 sellAmount = estimateSell(_itemAddress, _itemId);

        withdrawnRewards[_itemAddress][_itemId] += sellAmount;

        address _treasury = IAddressBook(addressBook).treasury();
        uint256 withdrawTokenAmount = ITreasury(_treasury).usdAmountToToken(
            sellAmount,
            _withdrawToken
        );
        require(withdrawTokenAmount > 0, "zero amount!");

        IItem(_itemAddress).burn(_itemId);
        ITreasury(_treasury).withdraw(_withdrawToken, withdrawTokenAmount, msg.sender);
    }

    // ------------------------------------------------------------------------------------
    // ----- VIEW  ------------------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    function stakingType() external pure returns (string memory) {
        return "flex";
    }

    function currentYear() external view returns (uint256) {
        return DateTimeLib.getYear(block.timestamp);
    }

    // function currentPeriod() external view returns (uint256 year_, uint256 month_) {
    //     return timestampPeriod(block.timestamp);
    // }

    function timestampPeriod(
        uint256 _timestamp
    ) public pure returns (uint256 year_, uint256 month_) {
        (year_, month_, ) = DateTimeLib.timestampToDate(_timestamp);
    }

    function claimTimestamp(
        address _itemAddress,
        uint256 _itemId,
        uint256 _monthsCount
    ) external view returns (uint256) {
        uint256 _finalTimestamp = finalTimestamp[_itemAddress][_itemId];
        uint256 _initialTimestamp = initialTimestamp[_itemAddress][_itemId];
        uint256 _nextClaimTimestamp = DateTimeLib.addMonths(_initialTimestamp, _monthsCount);
        if (_nextClaimTimestamp > _finalTimestamp) _nextClaimTimestamp = _finalTimestamp;
        return _nextClaimTimestamp;
    }

    function estimateRewards(
        address _itemAddress,
        uint256 _itemId
    ) public view returns (uint256 rewards_) {
        console.log(
            "test",
            DateTimeLib.diffMonths(block.timestamp, block.timestamp + 60 * 60 * 24 * 5)
        );

        uint256 _initialTimestamp = initialTimestamp[_itemAddress][_itemId];
        uint256 _lastClaimTimestamp = lastClaimTimestamp[_itemAddress][_itemId];
        uint256 _finalTimestamp = finalTimestamp[_itemAddress][_itemId];

        uint256 currentTimestamp = block.number;
        if (currentTimestamp > _finalTimestamp) currentTimestamp = _finalTimestamp;

        uint256 totalPrice = IItem(_itemAddress).tokenPrice(_itemId);

        uint256 allExpiredMonths = DateTimeLib.diffMonths(_initialTimestamp, block.timestamp);
        uint256 claimedMonths = DateTimeLib.diffMonths(_initialTimestamp, _lastClaimTimestamp);

        uint256 _remainder = remainder[_itemAddress][_itemId];
        uint256 _maxClaimedMonths = maxClaimedMonths[_itemAddress][_itemId];
        uint256 _initialMonths = initialMonths;
        uint256 _initialRewardsRate = initialRewardsRate;
        (uint256 year, uint256 month, ) = DateTimeLib.timestampToDate(block.timestamp);

        console.log("now year", year);
        console.log("now month", month);
        for (uint256 i = claimedMonths; i < allExpiredMonths; ++i) {
            console.log("i", i);
            if (i < _initialMonths) {
                rewards_ += (totalPrice * _initialRewardsRate) / 10000;
                continue;
            }

            (uint256 year, uint256 month, ) = DateTimeLib.timestampToDate(
                DateTimeLib.addMonths(_initialTimestamp, i)
            );

            console.log("year", year);
            console.log("month", month);

            uint256 _earnings = earnings[year][month];
            console.log("_earnings", _earnings);
            if (_earnings == 0) break;

            uint256 itemsPrice = totalPrice;
            if (i == _initialMonths) {
                itemsPrice = totalPrice - _remainder;
            } else if (i == _maxClaimedMonths - 1) {
                itemsPrice = _remainder;
            }

            console.log("deposits[year][month]", deposits[year][month]);
            rewards_ += (itemsPrice * _earnings) / deposits[year][month];
        }
    }

    function canSell(address _itemAddress, uint256 _itemId) public view returns (bool) {
        uint256 _startSellTimestamp = startSellTimestamp[_itemAddress][_itemId];
        uint256 rewards = estimateRewards(_itemAddress, _itemId);
        return block.timestamp >= _startSellTimestamp && rewards == 0;
    }

    function estimateSell(address _itemAddress, uint256 _itemId) public view returns (uint256) {
        uint256 _initialTimestamp = initialTimestamp[_itemAddress][_itemId];
        uint256 _finalTimestamp = finalTimestamp[_itemAddress][_itemId];
        uint256 timestamp = block.timestamp;

        if (timestamp > _finalTimestamp) timestamp = _finalTimestamp;
        uint256 allExpiredMonths = DateTimeLib.diffMonths(_initialTimestamp, timestamp);

        if (allExpiredMonths < minLockYears * 12) return 0;

        uint256 maxMonths = maxLockYears * 12;
        if (allExpiredMonths > maxMonths) allExpiredMonths = maxMonths;

        uint256 tokenPrice = IItem(_itemAddress).tokenPrice(_itemId);
        uint256 deprecation = (tokenPrice * allExpiredMonths * yearDeprecationRate) / 12 / 10000;

        if (deprecation > tokenPrice) return 0;
        return tokenPrice - deprecation;
    }

    // ------------------------------------------------------------------------------------
    // ----- INTERNAL  --------------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    function _enforceIsTokenOwner(address _tokenAddress, uint256 _tokenId) internal view {
        require(IERC721(_tokenAddress).ownerOf(_tokenId) == msg.sender, "only token owner!");
    }
}

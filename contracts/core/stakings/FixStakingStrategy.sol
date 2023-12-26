// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import { ITreasury } from "../../interfaces/ITreasury.sol";
import { IItem } from "../../interfaces/IItem.sol";
import { IStakingStrategy } from "../../interfaces/IStakingStrategy.sol";
import { IAddressBook } from "../../interfaces/IAddressBook.sol";
import { MulticallUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/MulticallUpgradeable.sol";

contract FixStakingStrategy is IStakingStrategy, ReentrancyGuardUpgradeable, UUPSUpgradeable, MulticallUpgradeable {
    // ------------------------------------------------------------------------------------
    // ----- CONSTANTS --------------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    uint256 public constant REWARDS_PERIOD = 30 days;

    // ------------------------------------------------------------------------------------
    // ----- STORAGE ----------------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    address public addressBook;
    uint256 public rewardsRate;
    uint256 public lockYears;
    uint256 public yearDeprecationRate;
    uint256 public maxPeriodsCount;

    mapping(address item => mapping(uint256 tokenId => bool)) public isStakedToken;
    mapping(address item => mapping(uint256 tokenId => uint256)) public initialTimestamp;
    mapping(address item => mapping(uint256 tokenId => uint256)) public claimedPeriodsCount;
    mapping(address item => mapping(uint256 tokenId => uint256)) public finalTimestamp;
    mapping(address item => mapping(uint256 tokenId => uint256)) public totalWithdrawn;
    mapping(address item => mapping(uint256 tokenId => uint256)) public itemsPrice;

    // ------------------------------------------------------------------------------------
    // ----- EVENTS  ----------------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    event Stake(
        address itemAddress,
        uint256 itemId,
        address itemOwner,
        uint256 itemsPrice,
        uint256 initialTimestamp,
        uint256 finalTimestamp
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

    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _addressBook,
        uint256 _rewardsRate,
        uint256 _lockYears,
        uint256 _yearDeprecationRate
    ) public initializer {
        require(_rewardsRate > 0, "_rewardsRate  cannot be zero");
        require(_lockYears > 0, "_lockYears  cannot be zero");
        addressBook = _addressBook;
        rewardsRate = _rewardsRate;
        lockYears = _lockYears;
        yearDeprecationRate = _yearDeprecationRate;
        maxPeriodsCount = _lockYears * 12;
    }

    function _authorizeUpgrade(address) internal view override {
        IAddressBook(addressBook).enforceIsProductOwner(msg.sender);
    }

    // ------------------------------------------------------------------------------------
    // -----  PROTOCOL ACTIONS  -----------------------------------------------------------
    // ------------------------------------------------------------------------------------

    function stake(address _itemAddress, uint256 _itemId, bytes memory) external {
        IAddressBook(addressBook).enforceIsItemContract(msg.sender);

        isStakedToken[_itemAddress][_itemId] = true;
        uint256 _initialTimestamp = _blockTimestamp();
        initialTimestamp[_itemAddress][_itemId] = _initialTimestamp;
        uint256 _finalTimestamp = _initialTimestamp + REWARDS_PERIOD * lockYears * 12;
        finalTimestamp[_itemAddress][_itemId] = _finalTimestamp;
        uint256 _itemsPrice = IItem(_itemAddress).price();
        itemsPrice[_itemAddress][_itemId] = _itemsPrice;

        address _itemOwner = IERC721(_itemAddress).ownerOf(_itemId);

        emit Stake(
            _itemAddress,
            _itemId,
            _itemOwner,
            _itemsPrice,
            _initialTimestamp,
            _finalTimestamp
        );
    }

    // ------------------------------------------------------------------------------------
    // ----- USER ACTIONS  ----------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    function claim(
        address _itemAddress,
        uint256 _itemId,
        address _withdrawToken
    ) external nonReentrant {
        _enforceIsItemOwner(_itemAddress, _itemId);
        _enforceIsStakedToken(_itemAddress, _itemId);
        address _itemOwner = msg.sender;
        
        (uint256 rewards, uint256 claimedPeriods) = estimateRewards(_itemAddress, _itemId);
        require(rewards > 0, "not has rewards!");

        claimedPeriodsCount[_itemAddress][_itemId] += claimedPeriods;
        totalWithdrawn[_itemAddress][_itemId] += rewards;

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

    function sell(
        address _itemAddress,
        uint256 _itemId,
        address _withdrawToken
    ) external nonReentrant {
        _enforceIsItemOwner(_itemAddress, _itemId);
        _enforceIsStakedToken(_itemAddress, _itemId);
        address _itemOwner = msg.sender;

        require(canSell(_itemAddress, _itemId), "can't sell!");

        address _treasury = IAddressBook(addressBook).treasury();
        uint256 sellAmount = estimateSell(_itemAddress, _itemId);
        uint256 withdrawTokenAmount = ITreasury(_treasury).usdAmountToToken(
            sellAmount,
            _withdrawToken
        );
        require(withdrawTokenAmount > 0, "zero amount!");

        totalWithdrawn[_itemAddress][_itemId] += sellAmount;
        IItem(_itemAddress).burn(_itemId);
        ITreasury(_treasury).withdraw(_withdrawToken, withdrawTokenAmount, msg.sender);

        emit Sell(
            _itemAddress,
            _itemId,
            _itemOwner,
            sellAmount,
            _withdrawToken,
            withdrawTokenAmount
        );
    }

    // ------------------------------------------------------------------------------------
    // ----- VIEW  ------------------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    function stakingType() external pure returns (string memory) {
        return "fix";
    }

    function estimateRewards(
        address _itemAddress,
        uint256 _itemId
    ) public view returns (uint256 rewards_, uint256 claimedPeriods_) {
        uint256 _initialTimestamp = initialTimestamp[_itemAddress][_itemId];
        uint256 _claimedPeriodsCount = claimedPeriodsCount[_itemAddress][_itemId];
        uint256 _finalTimestamp = finalTimestamp[_itemAddress][_itemId];

        uint256 estimatedTimestamp = _blockTimestamp();
        if (estimatedTimestamp > _finalTimestamp) estimatedTimestamp = _finalTimestamp;
        uint256 allExpiredPeriods = (estimatedTimestamp - _initialTimestamp) / REWARDS_PERIOD;
        uint256 _itemsPrice = itemsPrice[_itemAddress][_itemId];

        claimedPeriods_ = allExpiredPeriods - _claimedPeriodsCount;
        rewards_ = (claimedPeriods_ * _itemsPrice * rewardsRate) / 12 / 10000;
    }

    function canSell(address _itemAddress, uint256 _itemId) public view returns (bool) {
        return
            _blockTimestamp() >= finalTimestamp[_itemAddress][_itemId] &&
            claimedPeriodsCount[_itemAddress][_itemId] == maxPeriodsCount;
    }

    /// @dev May return zero in collections where the cost of equipment is not returned
    function estimateSell(address _itemAddress, uint256 _itemId) public view returns (uint256) {
        uint256 _itemsPrice = itemsPrice[_itemAddress][_itemId];
        uint256 deprecation = (_itemsPrice * lockYears * yearDeprecationRate) / 10000;
        if (deprecation > _itemsPrice) return 0;
        return _itemsPrice - deprecation;
    }

    function claimTimestamp(
        address _itemAddress,
        uint256 _itemId,
        uint256 _monthsCount
    ) external view returns (uint256) {
        uint256 _finalTimestamp = finalTimestamp[_itemAddress][_itemId];
        uint256 _initialTimestamp = initialTimestamp[_itemAddress][_itemId];
        uint256 _nextClaimTimestamp = _initialTimestamp + _monthsCount * REWARDS_PERIOD;
        if (_nextClaimTimestamp > _finalTimestamp) _nextClaimTimestamp = _finalTimestamp;
        return _nextClaimTimestamp;
    }

    function _enforceIsStakedToken(address _itemAddress, uint256 _itemId) internal view {
        require(isStakedToken[_itemAddress][_itemId], "only staked token");
    }

    function _enforceIsItemOwner(address _itemAddress, uint256 _itemId) internal view {
        require(msg.sender == IERC721(_itemAddress).ownerOf(_itemId), "only item owner!");
    }

    function _blockTimestamp() internal view returns (uint256) {
        return block.timestamp;
    }
}

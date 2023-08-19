// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { ERC721Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { ITreasury } from "../interfaces/ITreasury.sol";
import { IItem } from "../interfaces/IItem.sol";
import { IStakingStrategy } from "../interfaces/IStakingStrategy.sol";
import { DateTimeLib } from "../libs/DateTimeLib.sol";
import { IAddressBook } from "../interfaces/IAddressBook.sol";

contract FixStakingStrategy is IStakingStrategy, ReentrancyGuardUpgradeable, UUPSUpgradeable {
    // ------------------------------------------------------------------------------------
    // ----- STORAGE ----------------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    address public addressBook;
    uint256 public rewardsRate;
    uint256 public lockYears;
    uint256 public yearDeprecationRate;
    mapping(address => mapping(uint256 => uint256)) public initialTimestamp;
    mapping(address => mapping(uint256 => uint256)) public lastClaimTimestamp;
    mapping(address => mapping(uint256 => uint256)) public finalTimestamp;

    // ------------------------------------------------------------------------------------
    // ----- DEPLOY & UPGRADE  ------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    function initialize(
        address _addressBook,
        uint256 _rewardsRate,
        uint256 _lockYears,
        uint256 _yearDeprecationRate
    ) public initializer {
        addressBook = _addressBook;
        rewardsRate = _rewardsRate;
        lockYears = _lockYears;
        yearDeprecationRate = _yearDeprecationRate;
    }

    function _authorizeUpgrade(address) internal view override {
        IAddressBook(addressBook).enforceIsStakingStrategyContract(msg.sender);
    }

    // ------------------------------------------------------------------------------------
    // -----  PROTOCOL ACTIONS  -----------------------------------------------------------
    // ------------------------------------------------------------------------------------

    function stake(address _itemAddress, uint256 _itemId, bytes memory) external {
        IAddressBook(addressBook).enforceIsItemContract(msg.sender);

        uint256 _initialTimestamp = block.timestamp;
        initialTimestamp[_itemAddress][_itemId] = _initialTimestamp;
        lastClaimTimestamp[_itemAddress][_itemId] = _initialTimestamp;
        finalTimestamp[_itemAddress][_itemId] = DateTimeLib.addYears(_initialTimestamp, lockYears);
    }

    // ------------------------------------------------------------------------------------
    // ----- USER ACTIONS  ----------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    function claim(
        address _itemAddress,
        uint256 _itemId,
        address _withdrawToken
    ) external nonReentrant {
        _enforceIsTokenOwner(_itemAddress, _itemId);

        (uint256 rewards, uint256 expiredPeriods) = estimateRewards(_itemAddress, _itemId);
        require(rewards > 0, "rewards!");

        lastClaimTimestamp[_itemAddress][_itemId] = DateTimeLib.addMonths(
            lastClaimTimestamp[_itemAddress][_itemId],
            expiredPeriods
        );

        address _treasury = IAddressBook(addressBook).treasury();
        uint256 withdrawTokenAmount = ITreasury(_treasury).usdAmountToToken(
            rewards,
            _withdrawToken
        );
        ITreasury(_treasury).withdraw(_withdrawToken, withdrawTokenAmount, msg.sender);
    }

    function sell(
        address _itemAddress,
        uint256 _itemId,
        address _withdrawToken
    ) external nonReentrant {
        _enforceIsTokenOwner(_itemAddress, _itemId);

        require(canSell(_itemAddress, _itemId), "can't sell!");

        address _treasury = IAddressBook(addressBook).treasury();

        uint256 sellAmount = estimateSell(_itemAddress, _itemId);
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

    function estimateRewards(
        address _itemAddress,
        uint256 _itemId
    ) public view returns (uint256 rewards_, uint256 expiredPeriods_) {
        uint256 _lastClaimTimestamp = lastClaimTimestamp[_itemAddress][_itemId];
        uint256 _finalTimestamp = finalTimestamp[_itemAddress][_itemId];

        uint256 estimateTimestamp = block.timestamp;
        if (estimateTimestamp > _finalTimestamp) estimateTimestamp = _finalTimestamp;

        expiredPeriods_ = DateTimeLib.diffMonths(_lastClaimTimestamp, estimateTimestamp);

        rewards_ =
            (expiredPeriods_ * IItem(_itemAddress).tokenPrice(_itemId) * rewardsRate) /
            12 /
            10000;
    }

    function canSell(address _itemAddress, uint256 _itemId) public view returns (bool) {
        uint256 _finalTimestamp = finalTimestamp[_itemAddress][_itemId];
        (uint256 rewards, ) = estimateRewards(_itemAddress, _itemId);
        return block.timestamp >= _finalTimestamp && rewards == 0;
    }

    function estimateSell(address _itemAddress, uint256 _itemId) public view returns (uint256) {
        uint256 tokenPrice = IItem(_itemAddress).tokenPrice(_itemId);
        uint256 deprecation = (tokenPrice * lockYears * yearDeprecationRate) / 10000;
        if (deprecation > tokenPrice) return 0;
        return tokenPrice - deprecation;
    }

    function nextClaimTimestamp(
        address _itemAddress,
        uint256 _itemId,
        uint256 _monthsCount
    ) external view returns (uint256) {
        uint256 _lastClaimTimestamp = lastClaimTimestamp[_itemAddress][_itemId];
        uint256 _finalTimestamp = finalTimestamp[_itemAddress][_itemId];
        uint256 _nextClaimTimestamp = DateTimeLib.addMonths(_lastClaimTimestamp, _monthsCount);
        if (_nextClaimTimestamp > _finalTimestamp) _nextClaimTimestamp = _finalTimestamp;
        return _nextClaimTimestamp;
    }

    // ------------------------------------------------------------------------------------
    // ----- INTERNAL  --------------------------------------------------------------------
    // ------------------------------------------------------------------------------------
    
    function _enforceIsTokenOwner(address _tokenAddress, uint256 _tokenId) internal view {
        require(IERC721(_tokenAddress).ownerOf(_tokenId) == msg.sender, "only token owner!");
    }
}

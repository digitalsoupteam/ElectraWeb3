// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { ERC721Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { IStakingPlatform } from "../interfaces/IStakingPlatform.sol";
import { IItemsFactory } from "../interfaces/IItemsFactory.sol";
import { ITreasury } from "../interfaces/ITreasury.sol";
import { IRewardsStrategy } from "../interfaces/IRewardsStrategy.sol";
import { GovernanceRole } from "../roles/GovernanceRole.sol";
import { DateTimeLib } from "../libs/DateTimeLib.sol";
import { ConstantsLib } from "../libs/ConstantsLib.sol";
import { TransferLib } from "../libs/TransferLib.sol";
import "hardhat/console.sol";
contract StakingPlatform is IStakingPlatform, UUPSUpgradeable, ERC721Upgradeable, GovernanceRole {
    uint256 public seedRoundTimestamp;
    uint256 public nextStakingId;
    address public itemsFactory;
    address public treasury;
    mapping(address => bool) public registeredRewardsStrategies;
    address[] internal _rewardsStrategies;

    mapping(uint256 => StakingInfo) internal _stakingsInfo;

    function stakingsInfo(uint256 _stakingId) external view returns (StakingInfo memory) {
        return _stakingsInfo[_stakingId];
    }

    function _authorizeUpgrade(address) internal view override {
        _enforceIsGovernance();
    }

    function initialize(address _governance) public initializer {
        __ERC721_init("Staking", "SP");

        governance = _governance;

        seedRoundTimestamp = getLastMondayTimestamp(block.timestamp);
    }

    function getLastMondayTimestamp(uint256 _timestamp) public pure returns (uint256) {
        uint256 dayOfWeek = DateTimeLib.getDayOfWeek(_timestamp);
        return (_timestamp / 1 days) * 1 days - (dayOfWeek - 1) * 1 days;
    }

    function getRound(uint256 _timestamp) public view returns (uint256) {
        return (_timestamp - seedRoundTimestamp) / ConstantsLib.ONE_ROUND;
    }

    function roundStartTimestamp(uint256 _round) public view returns (uint256) {
        return _round * ConstantsLib.ONE_ROUND + seedRoundTimestamp;
    }

    function _enforceIsNotFreezed(uint256 _stakingId) internal view {
        require(_stakingsInfo[_stakingId].freezed == false, "StakingPlatformNew: freezed!");
    }

    function changeRewardsStrategy(uint256 _stakingId, address _newRewardsStrategy) external {
        StakingInfo storage stakingInfo = _stakingsInfo[_stakingId];
        _enforceIsNotFreezed(_stakingId);

        require(stakingInfo.lastClaimedRound < stakingInfo.finalRound, "not has available round!");

        uint256 lastRound = getRound(block.timestamp);
        if (lastRound > stakingInfo.finalRound) lastRound = stakingInfo.finalRound;

        IRewardsStrategy oldRewardsStrategy = IRewardsStrategy(stakingInfo.rewardsStrategy);
        IRewardsStrategy newRewardsStrategy = IRewardsStrategy(_newRewardsStrategy);

        uint256 expiredRounds = lastRound - stakingInfo.initialRound;
        uint256 remainingRounds = expiredRounds % oldRewardsStrategy.roundInOnePeriod();

        oldRewardsStrategy.disable(_stakingId);
        oldRewardsStrategy.removeStaking(_stakingId);
        uint256 finalRound = lastRound - 1;

        if (remainingRounds > 0) {
            uint256 freezedStakingId = nextStakingId++;
            _stakingsInfo[freezedStakingId] = stakingInfo;
            _stakingsInfo[freezedStakingId].freezed = true;
            _stakingsInfo[freezedStakingId].finalRound = finalRound;

            _safeMint(msg.sender, freezedStakingId);

            oldRewardsStrategy.registerStaking(freezedStakingId);
        }

        stakingInfo.rewardsStrategy = _newRewardsStrategy;
        stakingInfo.lastClaimedRound = finalRound;

        oldRewardsStrategy.registerStaking(_stakingId);
        newRewardsStrategy.enable(_stakingId, finalRound);
    }

    function stakeItems(
        uint256[] calldata _itemsIds,
        uint256[] calldata _itemsAmounts,
        address _rewardsStrategy,
        address _payToken
    ) external payable {
        uint256 stakingId = nextStakingId++;
        uint256 totalPrice = IItemsFactory(itemsFactory).newItems(_itemsIds, _itemsAmounts);
        
        TransferLib.transferFrom(
            _payToken,
            msg.sender,
            treasury,
            ITreasury(treasury).usdAmountToToken(totalPrice, _payToken)
        );

        uint256 initialRound = getRound(block.timestamp) + 1;
        _stakingsInfo[stakingId] = StakingInfo({
            itemsIds: _itemsIds,
            itemsAmounts: _itemsAmounts,
            totalPrice: totalPrice,
            rewardsStrategy: _rewardsStrategy,
            initialRound: initialRound,
            lastClaimedRound: initialRound,
            finalRound: initialRound + 5 * 52,
            freezed: false
        });
        _safeMint(msg.sender, stakingId);
        IRewardsStrategy rewardsStrategy = IRewardsStrategy(_rewardsStrategy);
        rewardsStrategy.registerStaking(stakingId);
        rewardsStrategy.enable(stakingId, initialRound);
    }

    function claimRewards(uint256 _stakingId, address _withdrawnToken) external {
        StakingInfo storage stakingInfo = _stakingsInfo[_stakingId];

        IRewardsStrategy rewardsStrategy = IRewardsStrategy(stakingInfo.rewardsStrategy);

        (uint256 rewards, uint256 claimedRoundsCount) = rewardsStrategy.claimRewards(_stakingId);

        stakingInfo.lastClaimedRound += claimedRoundsCount;

        ITreasury _treasury = ITreasury(treasury);
        _treasury.withdraw(
            _withdrawnToken,
            _treasury.usdAmountToToken(rewards, _withdrawnToken),
            msg.sender
        );

        uint256 availableRounds = stakingInfo.finalRound - stakingInfo.lastClaimedRound;
        if (stakingInfo.freezed && availableRounds == 0) {
            rewardsStrategy.disable(_stakingId);
            rewardsStrategy.removeStaking(_stakingId);
            _burn(_stakingId);
        }
    }

    function getSellPrice(uint256 _stakingId) public view returns (uint256) {
        StakingInfo storage stakingInfo = _stakingsInfo[_stakingId];

        uint256 lastRound = getRound(block.timestamp);
        if (lastRound > stakingInfo.finalRound) lastRound = stakingInfo.finalRound;

        uint256 expiredRounds = lastRound - stakingInfo.initialRound;

        uint256 totalPrice = stakingInfo.totalPrice;
        return
            totalPrice -
            (totalPrice * expiredRounds * ((10 * 1e18) / ConstantsLib.ROUNDS_IN_ONE_YEAR)) /
            100 /
            1e18;
    }

    function sellItems(uint256 _stakingId, address _withdrawnToken) external {
        StakingInfo storage stakingInfo = _stakingsInfo[_stakingId];
        require(stakingInfo.freezed == false, "cant sell freezed item!");

        uint256 initialRound = stakingInfo.initialRound;
        uint256 lastRound = getRound(block.timestamp);
        if (lastRound > stakingInfo.finalRound) lastRound = stakingInfo.finalRound;

        require(lastRound - initialRound >= ConstantsLib.MIN_ROUNDS_IN_STAKING, "min rounds to sell!");

        uint256 availableRounds = stakingInfo.finalRound - stakingInfo.lastClaimedRound;
        if (availableRounds == 0) {
            IRewardsStrategy rewardsStrategy = IRewardsStrategy(stakingInfo.rewardsStrategy);
            rewardsStrategy.disable(_stakingId);
            rewardsStrategy.removeStaking(_stakingId);
            _burn(_stakingId);
        } else {
            stakingInfo.freezed = true;
            stakingInfo.finalRound = lastRound;
        }

        ITreasury _treasury = ITreasury(treasury);
        _treasury.withdraw(
            _withdrawnToken,
            _treasury.usdAmountToToken(getSellPrice(_stakingId), _withdrawnToken),
            msg.sender
        );
    }

    function splitStake(
        uint256 _stakingId,
        uint256[] calldata _secondItemsIds,
        uint256[] calldata _secondItemsAmounts
    ) external {
        StakingInfo memory stakingInfo = _stakingsInfo[_stakingId];

        uint256[] memory curentItemsIds = stakingInfo.itemsIds;
        uint256[] memory curentItemsAmounts = stakingInfo.itemsAmounts;
        uint256 curentItemsIdsLength = curentItemsIds.length;

        require(
            _secondItemsIds.length != 0 &&
                _secondItemsIds.length < curentItemsIdsLength &&
                _secondItemsIds.length == _secondItemsAmounts.length,
            "length!"
        );

        uint256 firstItemsLength = curentItemsIdsLength - _secondItemsIds.length;
        uint256 firstIndex;
        uint256[] memory firstItemsIds = new uint256[](firstItemsLength);
        uint256[] memory firstItemsAmounts = new uint256[](firstItemsLength);

        for (uint256 currentIndex; currentIndex < curentItemsIdsLength; currentIndex++) {
            for (uint256 secondIndex; secondIndex < _secondItemsIds.length; secondIndex++) {
                if (curentItemsIds[currentIndex] == _secondItemsIds[secondIndex]) {
                    require(
                        _secondItemsAmounts[secondIndex] > 0 &&
                            curentItemsAmounts[currentIndex] >= _secondItemsAmounts[secondIndex],
                        "amounts!"
                    );
                    uint256 newAmount = curentItemsAmounts[currentIndex] -
                        _secondItemsAmounts[secondIndex];
                    if (newAmount > 0) {
                        uint256 index = firstIndex++;
                        firstItemsIds[index] = _secondItemsIds[secondIndex];
                        firstItemsAmounts[index] = newAmount;
                    }
                    break;
                } else if (secondIndex == (_secondItemsIds.length - 1)) {
                    uint256 index = firstIndex++;
                    firstItemsIds[index] = curentItemsIds[currentIndex];
                    firstItemsAmounts[index] = curentItemsAmounts[currentIndex];
                }
            }
        }

        IRewardsStrategy rewardsStrategy = IRewardsStrategy(stakingInfo.rewardsStrategy);
        rewardsStrategy.removeStaking(_stakingId);
        _burn(_stakingId);

        uint256 newTotalPrice = IItemsFactory(itemsFactory).totalPrice(
            _secondItemsIds,
            _secondItemsAmounts
        );

        uint256 firstStakingId = nextStakingId++;
        _stakingsInfo[firstStakingId] = stakingInfo;
        _stakingsInfo[firstStakingId].itemsIds = firstItemsIds;
        _stakingsInfo[firstStakingId].itemsAmounts = firstItemsAmounts;
        _stakingsInfo[firstStakingId].totalPrice -= newTotalPrice;
        _safeMint(msg.sender, firstStakingId);

        rewardsStrategy.registerStaking(firstStakingId);

        uint256 secondStakingId = nextStakingId++;
        _stakingsInfo[secondStakingId] = stakingInfo;
        _stakingsInfo[secondStakingId].itemsIds = _secondItemsIds;
        _stakingsInfo[secondStakingId].itemsAmounts = _secondItemsAmounts;
        _stakingsInfo[secondStakingId].totalPrice = newTotalPrice;
        _safeMint(msg.sender, secondStakingId);

        rewardsStrategy.registerStaking(secondStakingId);
    }

    function setItemsFactory(address _itemsFactory) external {
        _enforceIsGovernance();
        require(itemsFactory == address(0), "StakingPlatform: items factory already setted!");
        itemsFactory = _itemsFactory;
    }

    function setTreasury(address _treasury) external {
        _enforceIsGovernance();
        require(treasury == address(0), "StakingPlatform: treasury already setted!");
        treasury = _treasury;
    }

    function rewardsStrategies() external view returns (address[] memory) {
        return _rewardsStrategies;
    }

    function addRewardsStrategy(address _rewardsStartegy) external {
        _enforceIsGovernance();
        registeredRewardsStrategies[_rewardsStartegy] = true;
        _rewardsStrategies.push(_rewardsStartegy);
    }

    function _enforceIsSupportedRewardsStrategy(address _rewardsStrategy) internal view {
        require(
            registeredRewardsStrategies[_rewardsStrategy],
            "StakingPlatform: unknown rewards startegy!"
        );
    }

    function _enforceIsTokenOwner(uint256 _tokenId) internal view {
        require(ownerOf(_tokenId) == msg.sender, "StakingPlatform: unknown rewards startegy!");
    }
}

// // SPDX-License-Identifier: UNLICENSED
// pragma solidity 0.8.18;

// import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
// import { ERC721Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
// import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

// import { IStakingPlatform } from "../interfaces/IStakingPlatform.sol";
// import { IItemsFactory } from "../interfaces/IItemsFactory.sol";
// import { ITreasury } from "../interfaces/ITreasury.sol";
// import { IRewardsStrategy } from "../interfaces/IRewardsStrategy.sol";
// import { GovernanceRole } from "../roles/GovernanceRole.sol";
// import { DateTimeLib } from "../libs/DateTimeLib.sol";
// import { ConstantsLib } from "../libs/ConstantsLib.sol";
// import { TransferLib } from "../libs/TransferLib.sol";

// // import "hardhat/console.sol";

// contract StakingPlatform is
//     IStakingPlatform,
//     ReentrancyGuardUpgradeable,
//     UUPSUpgradeable,
//     ERC721Upgradeable,
//     GovernanceRole
// {
//     // ------------------------------------------------------------------------------------
//     // ----- STORAGE ----------------------------------------------------------------------
//     // ------------------------------------------------------------------------------------

//     uint256 public seedRoundTimestamp;
//     uint256 public nextStakingId;
//     address public itemsFactory;
//     address public treasury;
//     mapping(address => bool) public registeredRewardsStrategies;
//     mapping(string => address) public rewardsStrategiesByName;
//     address[] internal _rewardsStrategies;
//     mapping(uint256 => StakingInfo) internal _stakingsInfo;
//     bool public isSuspended;

//     // ------------------------------------------------------------------------------------
//     // ----- DEPLOY & UPGRADE  ------------------------------------------------------------
//     // ------------------------------------------------------------------------------------

//     function _authorizeUpgrade(address) internal view override {
//         _enforceIsGovernance();
//     }

//     function initialize(address _governance) public initializer {
//         __ERC721_init("Staking", "SP");

//         governance = _governance;

//         seedRoundTimestamp = getLastMondayTimestamp(block.timestamp);
//     }

//     // ------------------------------------------------------------------------------------
//     // ----- USER ACTIONS -----------------------------------------------------------------
//     // ------------------------------------------------------------------------------------

//     function stakeItems(
//         uint256[] calldata _itemsIds,
//         uint256[] calldata _itemsAmounts,
//         address _rewardsStrategy,
//         address _payToken
//     ) external payable nonReentrant {
//         _enforceIsNotSespended();
//         uint256 stakingId = nextStakingId++;
//         uint256 totalPrice = IItemsFactory(itemsFactory).newItems(_itemsIds, _itemsAmounts);

//         uint256 payTokenAmount = ITreasury(treasury).usdAmountToToken(totalPrice, _payToken);
//         TransferLib.transferFrom(_payToken, msg.sender, treasury, payTokenAmount);

//         uint256 initialRound = getRound(block.timestamp) + 1;
//         _stakingsInfo[stakingId] = StakingInfo({
//             itemsIds: _itemsIds,
//             itemsAmounts: _itemsAmounts,
//             totalPrice: totalPrice,
//             rewardsStrategy: _rewardsStrategy,
//             initialRound: initialRound,
//             claimedRoundsCount: 0,
//             finalRound: initialRound + 5 * ConstantsLib.ROUNDS_IN_ONE_YEAR - 1,
//             freezed: false
//         });
//         _safeMint(msg.sender, stakingId);
//         IRewardsStrategy rewardsStrategy = IRewardsStrategy(_rewardsStrategy);
//         rewardsStrategy.registerStaking(stakingId);
//         rewardsStrategy.enable(stakingId, initialRound);

//         emit StakeItems(
//             _itemsIds,
//             _itemsAmounts,
//             _rewardsStrategy,
//             msg.sender,
//             _payToken,
//             totalPrice,
//             payTokenAmount
//         );
//     }

//     function claimRewards(uint256 _stakingId, address _withdrawnToken) external nonReentrant {
//         _enforceIsNotSespended();
//         _enforceIsTokenOwner(_stakingId);
//         StakingInfo storage stakingInfo = _stakingsInfo[_stakingId];

//         require(
//             getRound(block.timestamp) > stakingInfo.initialRound,
//             "StakingPlatform: not has rounds to claim!"
//         );

//         IRewardsStrategy rewardsStrategy = IRewardsStrategy(stakingInfo.rewardsStrategy);
//         (uint256 rewards, uint256 claimedRoundsCount) = rewardsStrategy.claimRewards(_stakingId);

//         require(claimedRoundsCount > 0, "StakingPlatform: not has rounds to claim!");

//         stakingInfo.claimedRoundsCount += claimedRoundsCount;

//         ITreasury _treasury = ITreasury(treasury);
//         _treasury.withdraw(
//             _withdrawnToken,
//             _treasury.usdAmountToToken(rewards, _withdrawnToken),
//             msg.sender
//         );

//         uint256 lastClaimedRound = stakingInfo.initialRound + stakingInfo.claimedRoundsCount;
//         uint256 availableRounds = stakingInfo.finalRound - lastClaimedRound;
//         if (stakingInfo.freezed && availableRounds == 0) {
//             rewardsStrategy.disable(_stakingId);
//             rewardsStrategy.removeStaking(_stakingId);
//             _burn(_stakingId);
//         }
//     }

//     function sellItems(uint256 _stakingId, address _withdrawnToken) external nonReentrant {
//         _enforceIsNotSespended();
//         _enforceIsTokenOwner(_stakingId);
//         _enforceIsNotFreezed(_stakingId);

//         StakingInfo storage stakingInfo = _stakingsInfo[_stakingId];

//         uint256 initialRound = stakingInfo.initialRound;
//         uint256 lastRound = getRound(block.timestamp);
//         if (lastRound > stakingInfo.finalRound) lastRound = stakingInfo.finalRound;

//         require(
//             lastRound > initialRound &&
//                 lastRound - initialRound >= ConstantsLib.MIN_ROUNDS_IN_STAKING,
//             "StakingPlatform: not has expired rounds to sell!"
//         );

//         uint256 lastClaimedRound = stakingInfo.initialRound + stakingInfo.claimedRoundsCount;
//         uint256 availableRounds = stakingInfo.finalRound - lastClaimedRound;
//         if (availableRounds == 0) {
//             IRewardsStrategy rewardsStrategy = IRewardsStrategy(stakingInfo.rewardsStrategy);
//             rewardsStrategy.disable(_stakingId);
//             rewardsStrategy.removeStaking(_stakingId);
//             _burn(_stakingId);
//         } else {
//             stakingInfo.freezed = true;
//             stakingInfo.finalRound = lastRound;
//         }

//         ITreasury _treasury = ITreasury(treasury);
//         _treasury.withdraw(
//             _withdrawnToken,
//             _treasury.usdAmountToToken(getSellPrice(_stakingId), _withdrawnToken),
//             msg.sender
//         );
//     }

//     function changeRewardsStrategy(uint256 _stakingId, address _newRewardsStrategy) external nonReentrant {
//         _enforceIsNotSespended();
//         _enforceIsTokenOwner(_stakingId);
//         StakingInfo storage stakingInfo = _stakingsInfo[_stakingId];
//         _enforceIsNotFreezed(_stakingId);

//         uint256 lastClaimedRound = stakingInfo.initialRound + stakingInfo.claimedRoundsCount;
//         require(lastClaimedRound < stakingInfo.finalRound, "not has available round!");

//         uint256 lastRound = getRound(block.timestamp);
//         if (lastRound > stakingInfo.finalRound) lastRound = stakingInfo.finalRound;

//         IRewardsStrategy oldRewardsStrategy = IRewardsStrategy(stakingInfo.rewardsStrategy);
//         IRewardsStrategy newRewardsStrategy = IRewardsStrategy(_newRewardsStrategy);

//         uint256 expiredRounds = lastRound - stakingInfo.initialRound;
//         uint256 remainingRounds = expiredRounds % oldRewardsStrategy.roundInOnePeriod();

//         oldRewardsStrategy.disable(_stakingId);
//         oldRewardsStrategy.removeStaking(_stakingId);
//         uint256 finalRound = lastRound - 1;

//         if (remainingRounds > 0) {
//             uint256 freezedStakingId = nextStakingId++;
//             _stakingsInfo[freezedStakingId] = stakingInfo;
//             _stakingsInfo[freezedStakingId].freezed = true;
//             _stakingsInfo[freezedStakingId].finalRound = finalRound;

//             _safeMint(msg.sender, freezedStakingId);

//             oldRewardsStrategy.registerStaking(freezedStakingId);

//             stakingInfo.claimedRoundsCount += remainingRounds;
//         }

//         stakingInfo.rewardsStrategy = _newRewardsStrategy;

//         oldRewardsStrategy.registerStaking(_stakingId);
//         newRewardsStrategy.enable(_stakingId, finalRound);
//     }

//     function splitStake(
//         uint256 _stakingId,
//         uint256[] calldata _secondItemsIds,
//         uint256[] calldata _secondItemsAmounts
//     ) external nonReentrant {
//         _enforceIsNotSespended();
//         _enforceIsTokenOwner(_stakingId);
//         _enforceIsNotFreezed(_stakingId);

//         StakingInfo memory stakingInfo = _stakingsInfo[_stakingId];

//         uint256[] memory curentItemsIds = stakingInfo.itemsIds;
//         uint256[] memory curentItemsAmounts = stakingInfo.itemsAmounts;
//         uint256 curentItemsIdsLength = curentItemsIds.length;

//         require(
//             _secondItemsIds.length != 0 &&
//                 _secondItemsIds.length < curentItemsIdsLength &&
//                 _secondItemsIds.length == _secondItemsAmounts.length,
//             "length!"
//         );

//         uint256 firstItemsLength = curentItemsIdsLength - _secondItemsIds.length;
//         uint256 firstIndex;
//         uint256[] memory firstItemsIds = new uint256[](firstItemsLength);
//         uint256[] memory firstItemsAmounts = new uint256[](firstItemsLength);

//         for (uint256 currentIndex; currentIndex < curentItemsIdsLength; currentIndex++) {
//             for (uint256 secondIndex; secondIndex < _secondItemsIds.length; secondIndex++) {
//                 if (curentItemsIds[currentIndex] == _secondItemsIds[secondIndex]) {
//                     require(
//                         _secondItemsAmounts[secondIndex] > 0 &&
//                             curentItemsAmounts[currentIndex] >= _secondItemsAmounts[secondIndex],
//                         "amounts!"
//                     );
//                     uint256 newAmount = curentItemsAmounts[currentIndex] -
//                         _secondItemsAmounts[secondIndex];
//                     if (newAmount > 0) {
//                         uint256 index = firstIndex++;
//                         firstItemsIds[index] = _secondItemsIds[secondIndex];
//                         firstItemsAmounts[index] = newAmount;
//                     }
//                     break;
//                 } else if (secondIndex == (_secondItemsIds.length - 1)) {
//                     uint256 index = firstIndex++;
//                     firstItemsIds[index] = curentItemsIds[currentIndex];
//                     firstItemsAmounts[index] = curentItemsAmounts[currentIndex];
//                 }
//             }
//         }

//         IRewardsStrategy rewardsStrategy = IRewardsStrategy(stakingInfo.rewardsStrategy);
//         rewardsStrategy.removeStaking(_stakingId);
//         _burn(_stakingId);

//         uint256 newTotalPrice = IItemsFactory(itemsFactory).totalPrice(
//             _secondItemsIds,
//             _secondItemsAmounts
//         );

//         uint256 firstStakingId = nextStakingId++;
//         _stakingsInfo[firstStakingId] = stakingInfo;
//         _stakingsInfo[firstStakingId].itemsIds = firstItemsIds;
//         _stakingsInfo[firstStakingId].itemsAmounts = firstItemsAmounts;
//         _stakingsInfo[firstStakingId].totalPrice -= newTotalPrice;
//         _safeMint(msg.sender, firstStakingId);

//         rewardsStrategy.registerStaking(firstStakingId);

//         uint256 secondStakingId = nextStakingId++;
//         _stakingsInfo[secondStakingId] = stakingInfo;
//         _stakingsInfo[secondStakingId].itemsIds = _secondItemsIds;
//         _stakingsInfo[secondStakingId].itemsAmounts = _secondItemsAmounts;
//         _stakingsInfo[secondStakingId].totalPrice = newTotalPrice;
//         _safeMint(msg.sender, secondStakingId);

//         rewardsStrategy.registerStaking(secondStakingId);
//     }

//     // ------------------------------------------------------------------------------------
//     // ----- VIEW STATE -------------------------------------------------------------------
//     // ------------------------------------------------------------------------------------

//     function stakingsInfo(uint256 _stakingId) external view returns (StakingInfo memory) {
//         return _stakingsInfo[_stakingId];
//     }

//     function getLastMondayTimestamp(uint256 _timestamp) public pure returns (uint256) {
//         uint256 dayOfWeek = DateTimeLib.getDayOfWeek(_timestamp);
//         return (_timestamp / 1 days) * 1 days - (dayOfWeek - 1) * 1 days;
//     }

//     function getRound(uint256 _timestamp) public view returns (uint256) {
//         return (_timestamp - seedRoundTimestamp) / ConstantsLib.ONE_ROUND;
//     }

//     function roundStartTimestamp(uint256 _round) public view returns (uint256) {
//         return _round * ConstantsLib.ONE_ROUND + seedRoundTimestamp;
//     }

//     function getSellPrice(uint256 _stakingId) public view returns (uint256) {
//         StakingInfo storage stakingInfo = _stakingsInfo[_stakingId];

//         uint256 lastRound = getRound(block.timestamp);
//         if (lastRound > stakingInfo.finalRound) lastRound = stakingInfo.finalRound;

//         if (lastRound <= stakingInfo.initialRound) return 0;

//         uint256 expiredRounds = lastRound - stakingInfo.initialRound;

//         uint256 totalPrice = stakingInfo.totalPrice;
//         return
//             totalPrice -
//             (totalPrice * expiredRounds * ((10 * 1e18) / ConstantsLib.ROUNDS_IN_ONE_YEAR)) /
//             100 /
//             1e18;
//     }

//     function rewardsStrategies() external view returns (address[] memory) {
//         return _rewardsStrategies;
//     }

//     // ------------------------------------------------------------------------------------
//     // ----- INTERNAL METHODS -------------------------------------------------------------
//     // ------------------------------------------------------------------------------------

//     function _enforceIsSupportedRewardsStrategy(address _rewardsStrategy) internal view {
//         require(
//             registeredRewardsStrategies[_rewardsStrategy],
//             "StakingPlatform: unknown rewards startegy!"
//         );
//     }

//     function _enforceIsTokenOwner(uint256 _tokenId) internal view {
//         require(ownerOf(_tokenId) == msg.sender, "StakingPlatform: only token owner!");
//     }

//     function _enforceIsNotSespended() internal view {
//         require(isSuspended == false, "StakingPlatform: is sespended!");
//     }

//     function _enforceIsNotFreezed(uint256 _stakingId) internal view {
//         require(_stakingsInfo[_stakingId].freezed == false, "StakingPlatformNew: freezed!");
//     }

//     // ------------------------------------------------------------------------------------
//     // ----- GOVERNANCE ACTIONS -----------------------------------------------------------
//     // ------------------------------------------------------------------------------------

//     function setIsSuspended(bool _value) external {
//         _enforceIsGovernance();
//         isSuspended = _value;
//     }

//     function setItemsFactory(address _itemsFactory) external {
//         _enforceIsGovernance();
//         require(itemsFactory == address(0), "StakingPlatform: items factory already setted!");
//         itemsFactory = _itemsFactory;
//     }

//     function setTreasury(address _treasury) external {
//         _enforceIsGovernance();
//         require(treasury == address(0), "StakingPlatform: treasury already setted!");
//         treasury = _treasury;
//     }

//     function addRewardsStrategy(address _rewardsStartegy) external {
//         _enforceIsGovernance();
//         registeredRewardsStrategies[_rewardsStartegy] = true;
//         _rewardsStrategies.push(_rewardsStartegy);
//         string memory strategyName = IRewardsStrategy(_rewardsStartegy).name();
//         rewardsStrategiesByName[strategyName] = _rewardsStartegy;
//     }
// }

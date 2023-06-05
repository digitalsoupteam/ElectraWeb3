// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

import { ERC721EnumerableUpgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { IPricerToUSD } from "./interfaces/IPricerToUSD.sol";

contract RentStaking is
    ReentrancyGuardUpgradeable,
    OwnableUpgradeable,
    ERC721EnumerableUpgradeable
{
    uint256 public constant REWARS_PERIOD = 30 days;
    uint256 public constant PERCENT_PRECISION = 10000;

    string[] public items;
    mapping(string => uint256) public itemsPrices;

    uint256[] public lockPeriods;
    mapping(uint256 => uint256) public lockPeriodsRewardRates;

    uint256 public nextTokenId;

    address[] public supportedTokens;
    mapping(address => address) public pricers;

    mapping(uint256 => TokenInfo) public tokensInfo;

    struct TokenInfo {
        string itemName;
        uint256 lockPeriod;
        uint256 rewardsRate;
        uint256 buyPrice;
        uint256 sellPrice;
        uint256 initTimestamp;
        uint256 withdrawnRewards;
    }

    event Buy(address indexed recipient, uint256 indexed tokenId);
    event ClaimRewards(
        address indexed recipient,
        uint256 indexed tokenId,
        uint256 rewardsByUsd,
        uint256 rewardsByToken
    );
    event Sell(address indexed recipient, uint256 indexed tokenId);

    event AddItem(string indexed name, uint256 price);
    event UpdateItemPrice(string indexed name, uint256 oldPrice, uint256 newPrice);
    event DeleteItem(string indexed name);

    event AddToken(address token, address pricer);
    event UpdateTokenPricer(address token, address oldPricer, address newPricer);
    event DeleteToken(address token);

    event AddLockPeriod(uint256 lockPeriod, uint256 rewardsRate);
    event UpdateLockPeriodRewardsRate(
        uint256 lockPeriod,
        uint256 oldRewardsRate,
        uint256 newRewardsRate
    );
    event DeleteLockPeriod(uint256 lockPeriod);

    struct Item {
        string name;
        uint256 price;
    }

    struct LockPeriod {
        uint256 lockTime;
        uint256 rewardsRate;
    }

    struct SupportedToken {
        address token;
        address pricer;
    }

    function initialize(
        Item[] calldata _items,
        LockPeriod[] calldata _lockPerios,
        SupportedToken[] calldata _supportedTokens
    ) public initializer {
        __ReentrancyGuard_init();
        __Ownable_init();
        __ERC721_init("RentStaking", "RentStaking");

        // Init items
        uint256 l = _items.length;
        for (uint256 i; i < l; i++) {
            addItem(_items[i].name, _items[i].price);
        }

        // Init periods
        uint256 l2 = _lockPerios.length;
        for (uint256 i; i < l2; i++) {
            addLockPeriod(_lockPerios[i].lockTime, _lockPerios[i].rewardsRate);
        }

        // Init supported tokens
        uint256 l3 = _supportedTokens.length;
        for (uint256 i; i < l3; i++) {
            addToken(_supportedTokens[i].token, _supportedTokens[i].pricer);
        }
    }

    function getItems() external view returns (string[] memory) {
        return items;
    }

    function getItemsWithPrice() external view returns (Item[] memory) {
        Item[] memory result = new Item[](items.length);
        uint256 l = items.length;
        for (uint256 i; i < l; i++) {
            result[i] = Item({ name: items[i], price: itemsPrices[items[i]] });
        }
        return result;
    }

    function getSupportedTokens() external view returns (address[] memory) {
        return supportedTokens;
    }

    function getLockPeriods() external view returns (uint256[] memory) {
        return lockPeriods;
    }

    function getLockPeriodsWithRewardsRates() external view returns (LockPeriod[] memory) {
        LockPeriod[] memory result = new LockPeriod[](lockPeriods.length);
        uint256 l = lockPeriods.length;
        for (uint256 i; i < l; i++) {
            result[i] = LockPeriod({
                lockTime: lockPeriods[i],
                rewardsRate: lockPeriodsRewardRates[lockPeriods[i]]
            });
        }
        return result;
    }

    function addItem(string calldata _name, uint256 _price) public onlyOwner {
        require(itemsPrices[_name] == 0, "RentStaking: item already exists!");
        itemsPrices[_name] = _price;
        items.push(_name);

        emit AddItem(_name, _price);
    }

    function updateItemPrice(string calldata _name, uint256 _price) external onlyOwner {
        require(_price > 0, "RentStaking: can not set price 0, use deleteItem");
        uint256 oldItemPrice = itemsPrices[_name];
        require(oldItemPrice > 0, "RentStaking: item not exists!");
        itemsPrices[_name] = _price;

        emit UpdateItemPrice(_name, oldItemPrice, _price);
    }

    function _getItemIndex(string memory _name) internal view returns (uint256) {
        uint256 l = items.length;
        bytes32 nameHash = keccak256(abi.encodePacked(_name));
        for (uint256 i; i < l; i++) {
            if (nameHash == keccak256(abi.encodePacked(items[i]))) {
                return i;
            }
        }
        revert("RentStaking: not found item index");
    }

    function deleteItem(string calldata _name) external onlyOwner {
        require(itemsPrices[_name] > 0, "RentStaking: item not exists!");
        delete itemsPrices[_name];
        delete items[_getItemIndex(_name)];

        emit DeleteItem(_name);
    }

    function addLockPeriod(uint256 _lockTime, uint256 _rewardsRate) public onlyOwner {
        require(lockPeriodsRewardRates[_lockTime] == 0, "RentStaking: lock period already exists!");
        lockPeriodsRewardRates[_lockTime] = _rewardsRate;
        lockPeriods.push(_lockTime);

        emit AddLockPeriod(_lockTime, _rewardsRate);
    }

    function updateLockPeriodRewardsRate(
        uint256 _lockTime,
        uint256 _rewardsRate
    ) external onlyOwner {
        require(_rewardsRate > 0, "RentStaking: can not set rewards rate to 0, use deleteItem");
        uint256 oldRewardsRate = lockPeriodsRewardRates[_lockTime];
        require(oldRewardsRate > 0, "RentStaking: item not exists!");

        lockPeriodsRewardRates[_lockTime] = _rewardsRate;

        emit UpdateLockPeriodRewardsRate(_lockTime, oldRewardsRate, _rewardsRate);
    }

    function _getLockPeriodIndex(uint256 _lockTime) internal view returns (uint256) {
        uint256 l = lockPeriods.length;
        for (uint256 i; i < l; i++) {
            if (_lockTime == lockPeriods[i]) {
                return i;
            }
        }
        revert("RentStaking: not found lock period index");
    }

    function deleteLockPeriod(uint256 _lockTime) external onlyOwner {
        require(lockPeriodsRewardRates[_lockTime] > 0, "RentStaking: lock period not exists!");
        delete lockPeriodsRewardRates[_lockTime];
        delete lockPeriods[_getLockPeriodIndex(_lockTime)];

        emit DeleteLockPeriod(_lockTime);
    }

    function addToken(address _token, address _pricer) public onlyOwner {
        require(pricers[_token] == address(0), "RentStaking: token already exists!");
        pricers[_token] = _pricer;
        supportedTokens.push(_token);

        emit AddToken(_token, _pricer);
    }

    function updateTokenPricer(address _token, address _pricer) external onlyOwner {
        address oldPricer = pricers[_token];
        require(oldPricer != address(0), "RentStaking: token not exists!");
        pricers[_token] = _pricer;

        emit UpdateTokenPricer(_token, oldPricer, _pricer);
    }

    function _getTokenIndex(address _token) internal view returns (uint256) {
        uint256 l = supportedTokens.length;
        for (uint256 i; i < l; i++) {
            if (_token == supportedTokens[i]) {
                return i;
            }
        }
        revert("RentStaking: not found token index");
    }

    function deleteToken(address _token) external onlyOwner {
        require(pricers[_token] != address(0), "RentStaking: token not exists!");
        delete pricers[_token];
        delete supportedTokens[_getTokenIndex(_token)];

        emit DeleteToken(_token);
    }

    function _enforseIsTokenOwner(uint256 _tokenId) internal view {
        require(ownerOf(_tokenId) == msg.sender, "RentStaking: not token owner!");
    }

    function getTokenPriceUSD(address _token) public view returns (uint256) {
        address pricerAddress = pricers[_token];
        require(pricerAddress != address(0), "RentStaking: token not registered!");
        IPricerToUSD pricer = IPricerToUSD(pricerAddress);
        (, int256 tokenPrice, , , ) = pricer.latestRoundData();
        uint256 price = uint256(tokenPrice);
        require(price > 0, "RentStaking: price can not be zero!");
        return price;
    }

    function getBuyPriceByUSD(string calldata _itemName) public view returns (uint256) {
        uint256 itemPrice = itemsPrices[_itemName];
        require(itemPrice > 0, "RentStaking: item not exists!");
        return itemPrice;
    }

    function getBuyPriceByToken(
        string calldata _itemName,
        address _tokenForPay
    ) public view returns (uint256) {
        uint256 priceByUSD = getBuyPriceByUSD(_itemName);
        uint256 toknePriceUSD = getTokenPriceUSD(_tokenForPay);
        uint256 tokenAmount = (priceByUSD *
            IERC20Metadata(_tokenForPay).decimals() *
            toknePriceUSD) / 1e6;
        require(tokenAmount > 0, "RentStaking: token amount can not be zero!");
        return tokenAmount;
    }

    function buy(
        string calldata _itemName,
        uint256 _lockPeriod,
        address _tokenForPay
    ) external nonReentrant {
        uint256 itemPrice = itemsPrices[_itemName];
        require(itemPrice > 0, "RentStaking: item not exists!");

        uint256 rewardsRate = lockPeriods[_lockPeriod];
        require(rewardsRate > 0, "RentStaking: lockPeriod not exists!");

        uint256 tokenAmount = getBuyPriceByToken(_itemName, _tokenForPay);

        // Trasfer token for pay
        IERC20Metadata tokenForPay = IERC20Metadata(_tokenForPay);
        uint256 tokenBalanceBefore = tokenForPay.balanceOf(address(this));
        tokenForPay.transferFrom(msg.sender, address(this), tokenAmount);
        uint256 tokenBalanceAfter = tokenForPay.balanceOf(address(this));
        require(
            tokenBalanceAfter - tokenBalanceBefore == tokenAmount,
            "RentStaking: failed transfer token for pay!"
        );

        uint256 sellPrice = (itemPrice * 9) / 10;

        uint256 tokenId = nextTokenId++;
        _safeMint(msg.sender, tokenId);
        tokensInfo[tokenId] = TokenInfo({
            itemName: _itemName,
            lockPeriod: _lockPeriod,
            rewardsRate: rewardsRate,
            buyPrice: itemPrice,
            sellPrice: sellPrice,
            initTimestamp: block.timestamp,
            withdrawnRewards: 0
        });

        emit Buy(msg.sender, tokenId);
    }

    function rewardsToWithdrawByUSD(uint256 _tokenId) public view returns (uint256) {
        TokenInfo memory tokenInfo = tokensInfo[_tokenId];
        uint256 rewardsPeriodsCount = (block.timestamp - tokenInfo.initTimestamp) / REWARS_PERIOD;
        uint256 rewardForOnePeriod = (tokenInfo.buyPrice * tokenInfo.rewardsRate) /
            PERCENT_PRECISION;
        uint256 allCurrentRewards = rewardsPeriodsCount * rewardForOnePeriod;
        uint256 rewardsThatCanBeWithdrawn = allCurrentRewards - tokenInfo.withdrawnRewards;
        return rewardsThatCanBeWithdrawn;
    }

    function rewardsToWithdrawByToken(
        uint256 _tokenId,
        address _tokenToWithdrawn
    ) public view returns (uint256) {
        return
            (rewardsToWithdrawByUSD(_tokenId) *
                IERC20Metadata(_tokenToWithdrawn).decimals() *
                getTokenPriceUSD(_tokenToWithdrawn)) / 1e6;
    }

    function claimRewards(uint256 _tokenId, address _tokenToWithdrawn) public nonReentrant {
        _enforseIsTokenOwner(_tokenId);

        uint256 rewardsByUsd = rewardsToWithdrawByUSD(_tokenId);
        require(rewardsByUsd > 0, "RentStaking: no usd rewards to withdraw!");

        uint256 rewardsByToken = rewardsToWithdrawByToken(_tokenId, _tokenToWithdrawn);
        require(rewardsByToken > 0, "RentStaking: no token rewards to withdraw!");

        IERC20Metadata tokenToWithdrawn = IERC20Metadata(_tokenToWithdrawn);

        tokenToWithdrawn.transfer(msg.sender, rewardsByToken);

        tokensInfo[_tokenId].withdrawnRewards += rewardsByUsd;

        emit ClaimRewards(msg.sender, _tokenId, rewardsByUsd, rewardsByToken);
    }

    function lockPeriodIsExpired(uint256 _tokenId) public view returns (bool) {
        TokenInfo memory tokenInfo = tokensInfo[_tokenId];
        return block.timestamp >= tokenInfo.initTimestamp + tokenInfo.lockPeriod * 365 days;
    }

    function getSellAmoutByUSD(uint256 _tokenId) public view returns (uint256) {
        return tokensInfo[_tokenId].sellPrice;
    }

    function getSellAmoutByToken(
        uint256 _tokenId,
        address _tokenToWithdrawn
    ) public view returns (uint256) {
        return
            (getSellAmoutByUSD(_tokenId) *
                IERC20Metadata(_tokenToWithdrawn).decimals() *
                getTokenPriceUSD(_tokenToWithdrawn)) / 1e6;
    }

    function sell(uint256 _tokenId, address _tokenToWithdrawn) external nonReentrant {
        _enforseIsTokenOwner(_tokenId);

        require(lockPeriodIsExpired(_tokenId), "RentStaking: blocking period has not expired!");

        require(rewardsToWithdrawByUSD(_tokenId) == 0, "RentStaking: claim rewards before sell!");

        IERC20Metadata tokenToWithdrawn = IERC20Metadata(_tokenToWithdrawn);

        uint256 tokenAmountToWitdrawn = getSellAmoutByToken(_tokenId, _tokenToWithdrawn);

        require(tokenAmountToWitdrawn > 0, "RentStaking: not enough funds to sell!");

        tokenToWithdrawn.transfer(msg.sender, tokenAmountToWitdrawn);

        _burn(_tokenId);

        emit Sell(msg.sender, _tokenId);
    }
}

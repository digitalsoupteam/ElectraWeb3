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
    mapping(string => uint256) public items;
    mapping(uint256 => uint256) public lockPeriods;
    uint256 public nextTokenId;
    uint256 public rewardsPeriod;

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

    function initialize() public initializer {
        __ReentrancyGuard_init();
        __Ownable_init();
        __ERC721_init("RentStaking", "RentStaking");

        items["electric scooter"] = 1000;
        items["electric moped"] = 1000;
        items["electric bycicle"] = 1000;
        items["electric car"] = 1000;

        lockPeriods[1] = 1000;
        lockPeriods[2] = 2000;
        lockPeriods[3] = 2500;

        rewardsPeriod = 30 days;
    }

    function addItem(string calldata _name, uint256 _price) external onlyOwner {
        require(items[_name] == 0, "RentStaking: item already exists!");
        items[_name] = _price;
    }

    function updateItemPrice(string calldata _name, uint256 _price) external onlyOwner {
        require(_price > 0, "RentStaking: can not set price 0, use deleteItem");
        require(items[_name] > 0, "RentStaking: item not exists!");
        items[_name] = _price;
    }

    function deleteItem(string calldata _name) external onlyOwner {
        require(items[_name] > 0, "RentStaking: item not exists!");
        delete items[_name];
    }

    function addToken(address _token, address _pricer) external onlyOwner {
        require(pricers[_token] == address(0), "RentStaking: token already exists!");
        pricers[_token] = _pricer;
    }

    function setTokenPricer(address _token, address _pricer) external onlyOwner {
        require(pricers[_token] != address(0), "RentStaking: token not exists!");
        pricers[_token] = _pricer;
    }

    function deleteToken(address _token) external onlyOwner {
        require(pricers[_token] != address(0), "RentStaking: token not exists!");
        delete pricers[_token];
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
        uint256 itemPrice = items[_itemName];
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
        uint256 itemPrice = items[_itemName];
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
        uint256 rewardsPeriodsCount = (block.timestamp - tokenInfo.initTimestamp) / rewardsPeriod;
        uint256 rewardForOnePeriod = (tokenInfo.buyPrice * tokenInfo.rewardsRate) / 10000;
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

        require(
            rewardsToWithdrawByUSD(_tokenId) == 0,
            "RentStaking: claim rewards before sell!"
        );

        IERC20Metadata tokenToWithdrawn = IERC20Metadata(_tokenToWithdrawn);

        uint256 tokenAmountToWitdrawn = getSellAmoutByToken(_tokenId, _tokenToWithdrawn);

        require(tokenAmountToWitdrawn > 0, "RentStaking: not enough funds to sell!");

        tokenToWithdrawn.transfer(msg.sender, tokenAmountToWitdrawn);

        _burn(_tokenId);

        emit Sell(msg.sender, _tokenId);
    }
}

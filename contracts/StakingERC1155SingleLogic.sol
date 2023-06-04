// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

import { ERC721EnumerableUpgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract StakingERC1155 is
    ReentrancyGuardUpgradeable,
    OwnableUpgradeable,
    ERC721EnumerableUpgradeable
{
    mapping(string => uint256) public items;
    mapping(uint256 => uint256) public lockPeriods;
    uint256 public nextTokenId;
    uint256 public rewardsPeriod;

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
    event ClaimRewards(address indexed recipient, uint256 indexed tokenId);
    event Sell(address indexed recipient, uint256 indexed tokenId);

    function initialize() public initializer {
        __ReentrancyGuard_init();
        __Ownable_init();
        __ERC721_init("StakingERC1155", "StakingERC1155");

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
        require(items[_name] == 0, "StakingERC1155: item already exists!");
        items[_name] = _price;
    }

    function updateItemPrice(string calldata _name, uint256 _price) external onlyOwner {
        require(_price > 0, "StakingERC1155: can not set price 0, use deleteItem");
        require(items[_name] > 0, "StakingERC1155: item not exists!");
        items[_name] = _price;
    }

    function deleteItem(string calldata _name) external onlyOwner {
        require(items[_name] > 0, "StakingERC1155: item not exists!");
        delete items[_name];
    }

    function _enforseIsTokenOwner(uint256 _tokenId) internal view {
        require(ownerOf(_tokenId) == msg.sender, "StakingERC1155: not token owner!");
    }

    function buy(
        string calldata _itemName,
        uint256 _lockPeriod,
        address _tokenForPay
    ) external nonReentrant {
        uint256 itemPrice = items[_itemName];
        require(itemPrice > 0, "StakingERC1155: item not exists!");

        uint256 rewardsRate = lockPeriods[_lockPeriod];
        require(rewardsRate > 0, "StakingERC1155: lockPeriod not exists!");

        IERC20(_tokenForPay).transferFrom(msg.sender, address(this), itemPrice);

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

    function rewardsToWithdraw(uint256 _tokenId) public view returns (uint256) {
        TokenInfo memory tokenInfo = tokensInfo[_tokenId];
        uint256 rewardsPeriodsCount = (block.timestamp - tokenInfo.initTimestamp) / rewardsPeriod;
        uint256 rewardForOnePeriod = (tokenInfo.buyPrice * tokenInfo.rewardsRate) / 10000;
        uint256 allCurrentRewards = rewardsPeriodsCount * rewardForOnePeriod;
        uint256 rewardsThatCanBeWithdrawn = allCurrentRewards - tokenInfo.withdrawnRewards;
        return rewardsThatCanBeWithdrawn;
    }

    function claimRewards(uint256 _tokenId, address _tokenToWithdrawn) public nonReentrant {
        _enforseIsTokenOwner(_tokenId);

        TokenInfo memory tokenInfo = tokensInfo[_tokenId];

        uint256 rewardsThatCanBeWithdrawn = rewardsToWithdraw(_tokenId);
        require(rewardsThatCanBeWithdrawn > 0, "StakingERC1155: no rewards to withdraw!");

        IERC20(_tokenToWithdrawn).transfer(msg.sender, rewardsThatCanBeWithdrawn);
        emit ClaimRewards(msg.sender, _tokenId);

        tokenInfo.withdrawnRewards += rewardsThatCanBeWithdrawn;
    }


    function lockPeriodIsExpired(uint256 _tokenId) public view returns (bool) {
        TokenInfo memory tokenInfo = tokensInfo[_tokenId];
        return block.timestamp >= tokenInfo.initTimestamp + tokenInfo.lockPeriod * 365 days;
    }

    function sell(uint256 _tokenId, address _tokenToWithdrawn) external nonReentrant {
        _enforseIsTokenOwner(_tokenId);

        TokenInfo memory tokenInfo = tokensInfo[_tokenId];

        require(
            lockPeriodIsExpired(_tokenId),
            "StakingERC1155: blocking period has not expired!"
        );

        // Claim rewards if has not withdrawn
        uint256 rewardsThatCanBeWithdrawn = rewardsToWithdraw(_tokenId);
        if (rewardsThatCanBeWithdrawn > 0) {
            claimRewards(_tokenId, _tokenToWithdrawn);
        }

        _burn(_tokenId);

        IERC20(_tokenToWithdrawn).transfer(msg.sender, tokenInfo.sellPrice);

        emit Sell(msg.sender, _tokenId);
    }
}

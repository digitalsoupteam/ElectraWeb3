// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

import { ERC721EnumerableUpgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { IPricerToUSD } from "./interfaces/IPricerToUSD.sol";
import { TransferLib } from "./libs/TransferLib.sol";
import { TimestampLib } from "./libs/TimestampLib.sol";

// import "hardhat/console.sol";

contract RentStaking is
    ReentrancyGuardUpgradeable,
    OwnableUpgradeable,
    ERC721EnumerableUpgradeable
{
    // ------------------------------------------------------------------------------------
    // ----- CONSTANTS --------------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    // Один период наград равен 30 дням
    uint256 public constant REWARS_PERIOD = 30 days; // 360 days in "year"
    // Процентная точность, на данный момент без знаков после запятой
    uint256 public constant PERCENT_PRECISION = 100; // 1 = 1%, 100 = 100%
    // "Адрес" для BNB, так как у него нет адреса, используется нулевой, для совместимости с функциями работающими с ERC20
    address public constant BNB_PLACEHOLDER = address(0);

    // ------------------------------------------------------------------------------------
    // ----- STORAGE ----------------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    // Составная структура, представляющая собой итерируемую неупорядоченную коллекцию предметов техники
    mapping(uint256 => string) public items;
    mapping(string => uint256) public itemsIndexes;
    uint256 public itemsLength;
    // Цены предметов
    mapping(string => uint256) public itemsPrices;

    // Составная структура, представляющая собой итерируемую неупорядоченную коллекцию предметов техники
    mapping(uint256 => uint256) public lockPeriods;
    mapping(uint256 => uint256) public lockPeriodsIndexes;
    uint256 public lockPeriodsLength;
    // Процент наград каждого периода
    mapping(uint256 => uint256) public lockPeriodsRewardRates;

    // Составная структура, представляющая собой итерируемую неупорядоченную коллекцию предметов техники
    mapping(uint256 => address) public supportedTokens;
    mapping(address => uint256) public supportedTokensIndexes;
    uint256 public supportedTokensLength;
    // Ончейн прайсеры каждого поддерживаемого токена
    mapping(address => address) public pricers;

    // Счетчик id для новых токенов
    uint256 public nextTokenId;

    // Основное хранилище данных каждой NFT
    mapping(uint256 => TokenInfo) public tokensInfo;

    // Баланс всех поддерживаемых токенов, которые внесли пользователи, для снятия владельцем
    mapping(address => uint256) public tokensToOwnerWithdrawBalances;

    // Баланс всех поддерживаемых токенов, которые внес владелец, для расчетов с пользователями
    mapping(address => uint256) public tokensToUserWithdrawBalances;

    // ------------------------------------------------------------------------------------
    // ----- STRUCTURES -------------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    // Описывает данные каждой NFT, включая информацию по стейкингу
    struct TokenInfo {
        // Название техники, неизменно
        string itemName;
        // Период блокировки, в годах, может меняться только при повтрном стейкинге
        uint256 lockPeriod;
        // Процент годовых наград, может меняться только при повтрном стейкинге
        uint256 rewardsRate;
        // Цена покупки, в USD, может меняться только при повтрном стейкинге
        uint256 buyPrice;
        // Цена продажи, в USD, может меняться только при повтрном стейкинге
        uint256 sellPrice;
        // Временная метка начала дня, когда был сделан стейкинг, может меняться только при повтрном стейкинге
        uint256 initialDayTimestamp;
        // Временная метка последнего периода, с которого взяли награды
        uint256 lastRewardTimestamp;
        // Суммарное количество выведенных наград, в usd, сохраняеться при повторном стейкинге. Не несет функциональной ценности, только для аналитики
        uint256 withdrawnRewards;
        // Количество периодов, за которые были получены награды
        uint256 claimedPeriodsCount;
    }

    // Описывает предмет
    struct Item {
        string name;
        uint256 price;
    }

    // Описывает период блокировки
    struct LockPeriod {
        uint256 lockTime;
        uint256 rewardsRate;
    }

    // Описывает поддерживаемые токены (для расчетов/оплаты)
    struct SupportedToken {
        address token;
        address pricer;
    }

    // Описывает балансы токенов
    struct TokenAndBalace {
        address token;
        uint256 balance;
    }

    // ------------------------------------------------------------------------------------
    // ----- EVENTS -----------------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    event Buy(
        address indexed recipient,
        uint256 indexed tokenId,
        address indexed tokenForPay,
        uint256 tokenAmount
    );

    event ClaimRewards(
        address indexed recipient,
        uint256 indexed tokenId,
        address indexed withdrawnToken,
        uint256 claimedPeriodsCount,
        uint256 rewardsByUsd,
        uint256 rewardsByToken
    );

    event Sell(address indexed recipient, uint256 indexed tokenId);

    event ReStake(address indexed recipient, uint256 indexed tokenId);

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

    event Deposit(address indexed token, uint256 amount);

    event Withdraw(address indexed token, uint256 amount);

    // ------------------------------------------------------------------------------------
    // ----- CONTRACT INITIALIZE ----------------------------------------------------------
    // ------------------------------------------------------------------------------------

    // "Конструктор" для обвноляемых контрактов
    // Вызывается единственный раз, устанавливая начальный стейт контракта
    function initialize(
        string calldata _nftName,
        string calldata _nftSymbol,
        Item[] calldata _items,
        LockPeriod[] calldata _lockPerios,
        SupportedToken[] calldata _supportedTokens
    ) public initializer {
        // Init extends
        __ReentrancyGuard_init();
        __Ownable_init();
        __ERC721_init(_nftName, _nftSymbol);

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

    // ------------------------------------------------------------------------------------
    // ----- USER ACTIONS -----------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    // Покупка техники, и первоначальный стейкинг
    // Предмет на выбор [_itemName], период блокировки на выбор [_lockPeriod], токен для оплаты [_tokenForPay]
    //
    // Безопасность
    // - Повторный вход [nonReentrant]
    // - Только зарегестрированные предметы
    // - Только зарегестрированные периоды блокировки
    // - Только если сумма для оплаты в токенах больше 0
    // - Только если пользователь предоставил доступное количество средств для оплаты (если больше - вернем сдачу)
    // - Только если получатель может принимать ERC721 (EOA - всегда, контракты - должны реализовать соответствующий интерфейс)
    function buy(
        string calldata _itemName,
        uint256 _lockPeriod,
        address _tokenForPay
    ) external payable nonReentrant {
        uint256 itemPrice = itemsPrices[_itemName];
        require(itemPrice > 0, "RentStaking: item not exists!");

        uint256 rewardsRate = lockPeriodsRewardRates[_lockPeriod];
        require(rewardsRate > 0, "RentStaking: lockPeriod not exists!");

        uint256 tokenAmount = usdAmountToToken(itemPrice, _tokenForPay);
        require(tokenAmount > 0, "RentStaking: tokens amount can not be zero!");
        require(
            _getInputAmount(_tokenForPay) >= tokenAmount,
            "RentStaking: insufficient funds to pay!"
        );

        // ~ 38 000 gas
        TransferLib.transferFrom(_tokenForPay, tokenAmount, msg.sender, address(this));

        tokensToOwnerWithdrawBalances[_tokenForPay] += tokenAmount;

        uint256 sellPrice = calculateSellPrice(itemPrice);

        uint256 tokenId = nextTokenId++;

        uint256 initialDayTimestamp = TimestampLib.getStartDayTimestamp(block.timestamp);
        // ~ 70 000 gas
        _safeMint(msg.sender, tokenId);
        // ~ 160 000 gas
        tokensInfo[tokenId] = TokenInfo({
            itemName: _itemName,
            lockPeriod: _lockPeriod,
            rewardsRate: rewardsRate,
            buyPrice: itemPrice,
            sellPrice: sellPrice,
            initialDayTimestamp: initialDayTimestamp,
            lastRewardTimestamp: initialDayTimestamp,
            withdrawnRewards: 0,
            claimedPeriodsCount: 0
        });

        emit Buy(msg.sender, tokenId, _tokenForPay, tokenAmount);
    }

    // Получение наград
    // Выдаются по [_tokenId], в токенах [_tokenToWithdrawn] (ERC20 или BNB)
    //
    // Безопасность
    // - Повторный вход [nonReentrant]
    // - Только владелец токена
    // - Только если есть неизрасходованные периоды
    // - Только если накопилось достаточное количество периодов
    // - Только если есть награды в USD
    // - Только если есть награды в [_tokenToWithdrawn]
    // - Только если есть доступный баланс в [tokensToUserWithdrawBalances]
    function claimRewards(uint256 _tokenId, address _tokenToWithdrawn) public nonReentrant {
        _enforseIsTokenOwner(_tokenId);

        TokenInfo memory tokenInfo = tokensInfo[_tokenId];

        require(
            calculateNotClaimedPeriodsCount(_tokenId) > 0,
            "RentStaking: not has available periods! Sell or ReStake your item"
        );

        uint256 allExpiredPeriodsCount = calculateAllExpiredPeriodsCount(_tokenId, block.timestamp);
        require(allExpiredPeriodsCount > 0, "RentStaking: not has expired periods!");

        uint256 usdRewards = availableRewars(_tokenId, block.timestamp);
        require(usdRewards > 0, "RentStaking: not has usd rewards!");

        uint256 tokenReards = usdAmountToToken(usdRewards, _tokenToWithdrawn);
        require(tokenReards > 0, "RentStaking: not has token rewards!");

        require(
            tokensToUserWithdrawBalances[_tokenToWithdrawn] >= tokenReards,
            "RentStaking: not has token balance to claim!"
        );

        uint256 claimedPeriodsCount = calculatePeriodsCountToClaim(_tokenId, block.timestamp);

        tokensInfo[_tokenId].claimedPeriodsCount += claimedPeriodsCount;
        tokensInfo[_tokenId].withdrawnRewards += usdRewards;
        tokensInfo[_tokenId].lastRewardTimestamp =
            tokenInfo.initialDayTimestamp +
            allExpiredPeriodsCount *
            REWARS_PERIOD;

        TransferLib.transfer(_tokenToWithdrawn, tokenReards, msg.sender);

        emit ClaimRewards(
            msg.sender,
            _tokenId,
            _tokenToWithdrawn,
            claimedPeriodsCount,
            usdRewards,
            tokenReards
        );
    }

    // Продажа после истечения периода блокирвоки
    // Продаем по [_tokenId], выплата в токенах [_tokenToWithdrawn] (ERC20 или BNB)
    //
    // Безопасность
    // - Повторный вход [nonReentrant]
    // - Только владелец токена
    // - Только если истек период блокировки
    // - Только если нет наград для вывода
    // - Только если сумма вывода в токенах больше 0
    // - Только если есть доступный баланс в [tokensToUserWithdrawBalances]
    function sell(uint256 _tokenId, address _tokenToWithdrawn) external nonReentrant {
        _enforseIsTokenOwner(_tokenId);

        require(lockPeriodIsExpired(_tokenId), "RentStaking: blocking period has not expired!");

        require(
            availableRewars(_tokenId, block.timestamp) == 0,
            "RentStaking: claim rewards before sell!"
        );

        uint256 tokenAmountToWitdrawn = usdAmountToToken(
            tokensInfo[_tokenId].sellPrice,
            _tokenToWithdrawn
        );

        require(tokenAmountToWitdrawn > 0, "RentStaking: not enough funds to sell!");

        require(
            tokensToUserWithdrawBalances[_tokenToWithdrawn] >= tokenAmountToWitdrawn,
            "RentStaking: insufficient funds!"
        );

        tokensToUserWithdrawBalances[_tokenToWithdrawn] -= tokenAmountToWitdrawn;

        _burn(_tokenId);

        TransferLib.transfer(_tokenToWithdrawn, tokenAmountToWitdrawn, msg.sender);

        emit Sell(msg.sender, _tokenId);
    }

    // Повторный стейкинг, как альтернатив продаже
    // Стейкаем по [_tokenId], период блокировки на выбор [_lockPeriod]
    //
    // Безопасность
    // - Повторный вход [nonReentrant]
    // - Только владелец токена
    // - Только если истек период блокировки
    // - Только зарегестрированный период блокировки
    function reStake(uint256 _tokenId, uint256 _lockPeriod) external nonReentrant {
        _enforseIsTokenOwner(_tokenId);

        require(lockPeriodIsExpired(_tokenId), "RentStaking: blocking period has not expired!");

        require(
            availableRewars(_tokenId, block.timestamp) == 0,
            "RentStaking: claim rewards before restake!"
        );

        uint256 rewardsRate = lockPeriods[_lockPeriod];
        require(rewardsRate > 0, "RentStaking: lockPeriod not exists!");

        TokenInfo storage tokenInfo = tokensInfo[_tokenId];

        uint256 sellPrice = calculateSellPrice(tokenInfo.sellPrice);
        uint256 initialDayTimestamp = TimestampLib.getStartDayTimestamp(block.timestamp);

        tokenInfo.lockPeriod = _lockPeriod;
        tokenInfo.rewardsRate = rewardsRate;
        tokenInfo.buyPrice = tokenInfo.sellPrice;
        tokenInfo.sellPrice = sellPrice;
        tokenInfo.initialDayTimestamp = initialDayTimestamp;
        tokenInfo.lastRewardTimestamp = initialDayTimestamp;

        emit ReStake(msg.sender, _tokenId);
    }

    // ------------------------------------------------------------------------------------
    // ----- VIEW STATE -------------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    // Расчитывает точное количество неизрасходованных периодов
    function calculateNotClaimedPeriodsCount(uint256 _tokenId) public view returns (uint256) {
        return getTotalPeriodsCount(_tokenId) - tokensInfo[_tokenId].claimedPeriodsCount;
    }

    // Расчитывает сколько периодов наград прошло для токена, к указанной временной метке
    // Может вернуть значение превышающее доступное количество наград
    function calculateAllExpiredPeriodsCount(
        uint256 _tokenId,
        uint256 _timestamp
    ) public view returns (uint256) {
        return (_timestamp - tokensInfo[_tokenId].initialDayTimestamp) / REWARS_PERIOD;
    }

    // Расчитывает за сколько периодов можно будет запросить награды к временной метке
    // Возвращает точное число доступных периодов
    function calculatePeriodsCountToClaim(
        uint256 _tokenId,
        uint256 _timestamp
    ) public view returns (uint256) {
        uint256 allExpiredPeriodsCount = calculateAllExpiredPeriodsCount(_tokenId, _timestamp);
        uint256 notClaimedPeriodsCount = calculateNotClaimedPeriodsCount(_tokenId);
        return
            allExpiredPeriodsCount > notClaimedPeriodsCount
                ? notClaimedPeriodsCount
                : allExpiredPeriodsCount;
    }

    function calculatePeriodsCountToClaimNow(uint256 _tokenId) public view returns (uint256) {
        return calculatePeriodsCountToClaim(_tokenId, block.timestamp);
    }

    // Расчет количества наград для токена за один период
    function calculateRewardsForOnePeriod(uint256 _tokenId) public view returns (uint256) {
        return
            (tokensInfo[_tokenId].buyPrice * tokensInfo[_tokenId].rewardsRate) / PERCENT_PRECISION;
    }

    // Сколько наград доступно по токену к временной метке
    function availableRewars(uint256 _tokenId, uint256 _timestamp) public view returns (uint256) {
        return
            calculatePeriodsCountToClaim(_tokenId, _timestamp) *
            calculateRewardsForOnePeriod(_tokenId);
    }

    // Расчет количества периодов на период блокировки
    function getTotalPeriodsCount(uint256 _tokenId) public view returns (uint256) {
        return tokensInfo[_tokenId].lockPeriod * 12;
    }

    // Считает сколько средств в USD компания должна внести к дате [_timestamp], что бы расплатиться со всеми юзерами
    // Работает через пагинацию
    function calculateDepositAmount(
        uint256 _timestamp,
        uint256 _startTokenIndex,
        uint256 _endTokenIndex
    ) external view returns (uint256) {
        uint256 amount;
        for (uint256 i = _startTokenIndex; i < _endTokenIndex; i++) {
            uint256 tokenId = tokenByIndex(i);
            uint256 rewards = availableRewars(tokenId, _timestamp);
            amount += rewards;
            if (lockPeriodIsExpired(tokenId)) {
                amount += tokensInfo[tokenId].sellPrice;
            }
        }
        return amount;
    }

    // Получение массива строк, с названиями зарегестрированных предметов
    // Работает через пагинацию
    function getItems(
        uint256 _startIndex,
        uint256 _endIndex
    ) external view returns (string[] memory) {
        require(_startIndex < itemsLength, "Rent staking: start index out of bounds!");
        if (_endIndex > itemsLength) {
            _endIndex = itemsLength;
        }
        uint256 length = _endIndex - _startIndex;
        string[] memory result = new string[](length);
        uint256 index;
        for (uint256 i = _startIndex; i < _endIndex; i++) {
            result[index++] = items[i];
        }
        return result;
    }

    // Получение массива объектов, с названиями зарегестрированных предметов и их ценами
    // Работает через пагинацию
    function getItemsWithPrice(
        uint256 _startIndex,
        uint256 _endIndex
    ) external view returns (Item[] memory) {
        require(_startIndex < itemsLength, "Rent staking: start index out of bounds!");
        if (_endIndex > itemsLength) {
            _endIndex = itemsLength;
        }
        uint256 length = _endIndex - _startIndex;
        Item[] memory result = new Item[](length);
        uint256 index;
        for (uint256 i = _startIndex; i < _endIndex; i++) {
            result[index++] = Item({ name: items[i], price: itemsPrices[items[i]] });
        }
        return result;
    }

    // Получение массива чисел, представляющих доступные периоды блокировки
    // Работает через пагинацию
    function getLockPeriods(
        uint256 _startIndex,
        uint256 _endIndex
    ) external view returns (uint256[] memory) {
        require(_startIndex < lockPeriodsLength, "Rent staking: start index out of bounds!");
        if (_endIndex > lockPeriodsLength) {
            _endIndex = lockPeriodsLength;
        }
        uint256 length = _endIndex - _startIndex;
        uint256[] memory result = new uint256[](length);
        uint256 index;
        for (uint256 i = _startIndex; i < _endIndex; i++) {
            result[index++] = lockPeriods[i];
        }
        return result;
    }

    // Получение массива объектов, с доступными периодами блокировки и их процентом наград
    // Работает через пагинацию
    function getLockPeriodsWithRewardsRates(
        uint256 _startIndex,
        uint256 _endIndex
    ) external view returns (LockPeriod[] memory) {
        require(_startIndex < lockPeriodsLength, "Rent staking: start index out of bounds!");
        if (_endIndex > lockPeriodsLength) {
            _endIndex = lockPeriodsLength;
        }
        uint256 length = _endIndex - _startIndex;
        LockPeriod[] memory result = new LockPeriod[](length);
        uint256 index;
        for (uint256 i = _startIndex; i < _endIndex; i++) {
            result[index++] = LockPeriod({
                lockTime: lockPeriods[i],
                rewardsRate: lockPeriodsRewardRates[lockPeriods[i]]
            });
        }
        return result;
    }

    // Получение массива адресов, представляющих доступные токены для оплаты/вывода
    // Работает через пагинацию
    function getSupportedTokens(
        uint256 _startIndex,
        uint256 _endIndex
    ) external view returns (address[] memory) {
        require(_startIndex < supportedTokensLength, "Rent staking: start index out of bounds!");
        if (_endIndex > supportedTokensLength) {
            _endIndex = supportedTokensLength;
        }
        uint256 length = _endIndex - _startIndex;
        address[] memory result = new address[](length);
        uint256 index;
        for (uint256 i = _startIndex; i < _endIndex; i++) {
            result[index++] = supportedTokens[i];
        }
        return result;
    }

    // Получение массива объектов, с доступными токенами для оплаты/вывода и адресами их прайсеров
    // Работает через пагинацию
    function getSupportedTokensWithPricers(
        uint256 _startIndex,
        uint256 _endIndex
    ) external view returns (SupportedToken[] memory) {
        require(_startIndex < supportedTokensLength, "Rent staking: start index out of bounds!");
        if (_endIndex > supportedTokensLength) {
            _endIndex = supportedTokensLength;
        }
        uint256 length = _endIndex - _startIndex;
        SupportedToken[] memory result = new SupportedToken[](length);
        uint256 index;
        for (uint256 i = _startIndex; i < _endIndex; i++) {
            result[index++] = SupportedToken({
                token: supportedTokens[i],
                pricer: pricers[supportedTokens[i]]
            });
        }
        return result;
    }

    // Получает массив токенов и балансов доступных для вывода пользователей
    // Работает через пагинацию
    function getTokensToUserWithdrawBalances(
        uint256 _startIndex,
        uint256 _endIndex
    ) external view returns (TokenAndBalace[] memory) {
        require(_startIndex < supportedTokensLength, "Rent staking: start index out of bounds!");
        if (_endIndex > supportedTokensLength) {
            _endIndex = supportedTokensLength;
        }
        uint256 length = _endIndex - _startIndex;
        TokenAndBalace[] memory result = new TokenAndBalace[](length);
        uint256 index;
        for (uint256 i = _startIndex; i < _endIndex; i++) {
            address token = supportedTokens[i];
            result[index++] = TokenAndBalace({
                token: token,
                balance: tokensToUserWithdrawBalances[token]
            });
        }
        return result;
    }

    // Получает массив токенов и балансов доступных для вывода владельцем
    // Работает через пагинацию
    function getTokensToOwnerWithdrawBalances(
        uint256 _startIndex,
        uint256 _endIndex
    ) external view returns (TokenAndBalace[] memory) {
        require(_startIndex < supportedTokensLength, "Rent staking: start index out of bounds!");
        if (_endIndex > supportedTokensLength) {
            _endIndex = supportedTokensLength;
        }
        uint256 length = _endIndex - _startIndex;
        TokenAndBalace[] memory result = new TokenAndBalace[](length);
        uint256 index;
        for (uint256 i = _startIndex; i < _endIndex; i++) {
            address token = supportedTokens[i];
            result[index++] = TokenAndBalace({
                token: token,
                balance: tokensToOwnerWithdrawBalances[token]
            });
        }
        return result;
    }

    // Проверяет существует ли предмет с таким названием
    function isItemExists(string calldata _itemName) external view returns (bool) {
        return itemsPrices[_itemName] != 0;
    }

    // Проверяет существует ли период блокировки с таким временем
    function isLockPeriodExists(uint256 _lockPeriod) external view returns (bool) {
        return lockPeriodsRewardRates[_lockPeriod] != 0;
    }

    // Проверяет доступен ли токен для вывода или оплаты
    function isSupportedToken(address _token) external view returns (bool) {
        return pricers[_token] != address(0);
    }

    // Функция расчета цены продажи
    // !!! Требуется формула
    function calculateSellPrice(uint256 _price) public pure returns (uint256) {
        return (_price * 9) / 10;
    }

    // Получить цену ERC20 токена в USD через зарегестрированный прайсер
    function getTokenPriceUSD(address _token) public view returns (uint256) {
        address pricerAddress = pricers[_token];
        require(pricerAddress != address(0), "RentStaking: token not registered!");
        IPricerToUSD pricer = IPricerToUSD(pricerAddress);
        (, int256 tokenPrice, , , ) = pricer.latestRoundData();
        uint256 price = uint256(tokenPrice);
        require(price > 0, "RentStaking: price from pricer can not be zero!");
        return price;
    }

    // Конвертировать сумму в USD к количеству токенов, с учетом цен и decimals
    function usdAmountToToken(uint256 _usdAmount, address _token) public view returns (uint256) {
        uint256 decimals = _token == BNB_PLACEHOLDER ? 18 : IERC20Metadata(_token).decimals();
        return (_usdAmount * 10 ** decimals * getTokenPriceUSD(_token)) / 1e8;
    }

    // Истек ли период блокировки
    function lockPeriodIsExpired(uint256 _tokenId) public view returns (bool) {
        return block.timestamp >= getExpiredTimestamp(_tokenId);
    }

    // Получить временную метку, когда заканчивается период блокировки
    function getExpiredTimestamp(uint256 _tokenId) public view returns (uint256) {
        return
            tokensInfo[_tokenId].initialDayTimestamp + tokensInfo[_tokenId].lockPeriod * 365 days;
    }

    // Получить временную метку, когда можно будет запросить награды в следующий раз
    function getNextRewardTimestamp(uint256 _tokenId) external view returns (uint256) {
        return tokensInfo[_tokenId].lastRewardTimestamp + REWARS_PERIOD;
    }

    // Todo: fix legacy function
    function getBuyPriceByUSD(string calldata _itemName) public view returns (uint256) {
        uint256 itemPrice = itemsPrices[_itemName];
        require(itemPrice > 0, "RentStaking: item not exists!");
        return itemPrice;
    }

    // Todo: fix legacy function
    function getBuyPriceByToken(
        string calldata _itemName,
        address _tokenForPay
    ) public view returns (uint256) {
        uint256 priceByUSD = getBuyPriceByUSD(_itemName);
        uint256 tokenAmount = usdAmountToToken(priceByUSD, _tokenForPay);
        require(tokenAmount > 0, "RentStaking: token amount can not be zero!");
        return tokenAmount;
    }

    // Todo: fix legacy function
    function rewardsToWithdrawByUSD(uint256 _tokenId) public view returns (uint256) {
        return availableRewars(_tokenId, block.timestamp);
    }

    // Todo: fix legacy function
    function rewardsToWithdrawByToken(
        uint256 _tokenId,
        address _tokenToWithdrawn
    ) public view returns (uint256) {
        return usdAmountToToken(rewardsToWithdrawByUSD(_tokenId), _tokenToWithdrawn);
    }

    // ------------------------------------------------------------------------------------
    // ----- OWNER ACTIONS ----------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    // Владелец пополняет баланс для рассчетов
    function deposit(address _token, uint256 _amount) external payable onlyOwner {
        require(pricers[_token] != address(0), "RentStaking: can't deposit unsupported token!");
        require(_amount > 0, "RentStaking: empty deposit!");
        require(_getInputAmount(_token) >= _amount, "RentStaking: insufficient input amount!");

        tokensToUserWithdrawBalances[_token] += _amount;

        TransferLib.transferFrom(_token, _amount, msg.sender, address(this));

        emit Deposit(_token, _amount);
    }

    // Владелец выводит средства пользователей
    function withdraw(address _token, uint256 _amount) public payable onlyOwner {
        require(_amount > 0, "RentStaking: empty withdrawn!");
        require(
            tokensToOwnerWithdrawBalances[_token] >= _amount,
            "RentStaking: insufficient funds!"
        );

        tokensToOwnerWithdrawBalances[_token] -= _amount;

        TransferLib.transfer(_token, _amount, msg.sender);

        emit Withdraw(_token, _amount);
    }

    // Добавить новый предмет
    // !!! ввиду отсутсвия decimals при расчетах в USD, и PERCENT_PRECESSION = 100 - мы не можем устанавливать цену меньше 100, иначе в расчетах при деление будет 0
    function addItem(string calldata _name, uint256 _price) public onlyOwner {
        require(_price >= 100, "RentStaking: price can not be less 100!");
        require(itemsPrices[_name] == 0, "RentStaking: item already exists!");
        itemsPrices[_name] = _price;
        items[itemsLength] = _name;
        itemsIndexes[_name] = itemsLength;
        itemsLength++;

        emit AddItem(_name, _price);
    }

    // Обвноляет цену предмета
    // Не влияет на уже выпущенные токены
    // !!! ввиду отсутсвия decimals при расчетах в USD, и PERCENT_PRECESSION = 100 - мы не можем устанавливать цену меньше 100, иначе в расчетах при деление будет 0
    function updateItemPrice(string calldata _name, uint256 _price) external onlyOwner {
        require(_price > 0, "RentStaking: can not set price 0, use deleteItem");
        require(_price >= 100, "RentStaking: price can not be less 100!");
        uint256 oldItemPrice = itemsPrices[_name];
        require(oldItemPrice > 0, "RentStaking: item not exists!");
        itemsPrices[_name] = _price;

        emit UpdateItemPrice(_name, oldItemPrice, _price);
    }

    // Удаляет предмет
    // Не влияет на уже выпущенные токены
    function deleteItem(string calldata _name) external onlyOwner {
        require(itemsPrices[_name] > 0, "RentStaking: item not exists!");
        delete itemsPrices[_name];

        // Delete from array
        uint256 index = itemsIndexes[_name];
        uint256 lastIndex = --itemsLength;
        if (index != lastIndex) {
            string memory lastItem = items[lastIndex];
            items[index] = lastItem;
            itemsIndexes[lastItem] = index;
        }
        delete items[lastIndex];
        delete itemsIndexes[_name];

        emit DeleteItem(_name);
    }

    // Добавляет новый период блокировки
    function addLockPeriod(uint256 _lockTime, uint256 _rewardsRate) public onlyOwner {
        require(lockPeriodsRewardRates[_lockTime] == 0, "RentStaking: lock period already exists!");
        lockPeriodsRewardRates[_lockTime] = _rewardsRate;
        lockPeriods[lockPeriodsLength] = _lockTime;
        lockPeriodsIndexes[_lockTime] = lockPeriodsLength;
        lockPeriodsLength++;

        emit AddLockPeriod(_lockTime, _rewardsRate);
    }

    // Обновляет % наград для периода блокировки
    // Не влияет на уже выпущенные токены
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

    // Удаляет период блокировки
    // Не влияет на уже выпущенные токены
    function deleteLockPeriod(uint256 _lockTime) external onlyOwner {
        require(lockPeriodsRewardRates[_lockTime] > 0, "RentStaking: lock period not exists!");
        delete lockPeriodsRewardRates[_lockTime];

        // Delete from array
        uint256 index = lockPeriodsIndexes[_lockTime];
        uint256 lastIndex = --lockPeriodsLength;
        if (index != lastIndex) {
            uint256 lastLockPeriod = lockPeriods[lastIndex];
            lockPeriods[index] = lastLockPeriod;
            lockPeriodsIndexes[lastLockPeriod] = index;
        }
        delete lockPeriods[lastIndex];
        delete lockPeriodsIndexes[_lockTime];

        emit DeleteLockPeriod(_lockTime);
    }

    // Добавить новый токен для расчетов
    function addToken(address _token, address _pricer) public onlyOwner {
        require(pricers[_token] == address(0), "RentStaking: token already exists!");
        _enforceUsdPriserDecimals(_pricer);
        pricers[_token] = _pricer;
        supportedTokens[supportedTokensLength] = _token;
        supportedTokensIndexes[_token] = lockPeriodsLength;
        supportedTokensLength++;

        emit AddToken(_token, _pricer);
    }

    // Обновить прайсер для токена расчетов
    function updateTokenPricer(address _token, address _pricer) external onlyOwner {
        address oldPricer = pricers[_token];
        require(oldPricer != address(0), "RentStaking: token not exists!");
        _enforceUsdPriserDecimals(_pricer);
        pricers[_token] = _pricer;

        emit UpdateTokenPricer(_token, oldPricer, _pricer);
    }

    // Удалить токен для расчетов
    // При удалении, все токены на балансе будут переведены владельцу, с tokensToOwnerWithdrawBalances и tokensToUserWithdrawBalances
    function deleteToken(address _token) external onlyOwner {
        require(pricers[_token] != address(0), "RentStaking: token not exists!");

        // Witdraw before
        uint256 ownerBalance = tokensToOwnerWithdrawBalances[_token];
        uint256 userBalance = tokensToUserWithdrawBalances[_token];
        uint256 allBalance = ownerBalance + userBalance;
        if (allBalance > 0) {
            withdraw(_token, allBalance);
        }

        // Delete pricer
        delete pricers[_token];

        // Delete from array
        uint256 index = supportedTokensIndexes[_token];
        uint256 lastIndex = --supportedTokensLength;
        if (index != lastIndex) {
            address lastToken = supportedTokens[lastIndex];
            supportedTokens[index] = lastToken;
            supportedTokensIndexes[lastToken] = index;
        }
        delete supportedTokens[lastIndex];
        delete supportedTokensIndexes[_token];

        emit DeleteToken(_token);
    }

    // ------------------------------------------------------------------------------------
    // ----- INTERNAL METHODS -------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    function _enforseIsTokenOwner(uint256 _tokenId) internal view {
        require(ownerOf(_tokenId) == msg.sender, "RentStaking: not token owner!");
    }

    function _enforceUsdPriserDecimals(address _pricer) internal view {
        require(
            IPricerToUSD(_pricer).decimals() == 8,
            "RentStaking: usd pricer must be with decimal equal to 8!"
        );
    }

    function _getInputAmount(address _token) internal view returns (uint256) {
        if (_token == BNB_PLACEHOLDER) {
            return msg.value;
        } else {
            return IERC20Metadata(_token).allowance(msg.sender, address(this));
        }
    }
}

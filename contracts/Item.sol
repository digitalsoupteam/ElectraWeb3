// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { ERC721Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";

import { ITreasury } from "./interfaces/ITreasury.sol";
import { IStakingStrategy } from "./interfaces/IStakingStrategy.sol";
import { IGovernance } from "./interfaces/IGovernance.sol";
import { GovernanceRole } from "./roles/GovernanceRole.sol";

contract Item is ReentrancyGuardUpgradeable, UUPSUpgradeable, ERC721Upgradeable, GovernanceRole {
    // ------------------------------------------------------------------------------------
    // ----- STORAGE ----------------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    uint256 public price;
    uint256 public maxSupply;
    uint256 public totalMintedAmount;
    uint256 public nextTokenId;
    mapping(uint256 => uint256) public amountInToken;
    mapping(uint256 => address) public tokenStakingStrategy;

    // ------------------------------------------------------------------------------------
    // ----- EVENTS -----------------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    event Mint(
        address indexed holder,
        address indexed payToken,
        uint256 indexed tokenId,
        uint256 amount
    );

    // ------------------------------------------------------------------------------------
    // ----- DEPLOY & UPGRADE  ------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    function initialize(
        address _governance,
        string calldata _name,
        string calldata _symbol,
        uint256 _price,
        uint256 _maxSupply
    ) public initializer {
        __ERC721_init(_name, _symbol);
        governance = _governance;
        price = _price;
        maxSupply = _maxSupply;
    }

    function _authorizeUpgrade(address) internal view override {
        _enforceIsGovernance();
    }

    // ------------------------------------------------------------------------------------
    // ----- USER ACTIONS  ----------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    function mint(
        uint256 _amount,
        address _stakingStrategy,
        address _payToken,
        bytes memory _payload
    ) external nonReentrant {
        IGovernance(governance).enforceIsStakingStrategyContract(_stakingStrategy);

        require(_amount > 0, "amount!");

        totalMintedAmount += _amount;

        require(maxSupply >= totalMintedAmount, "maxSupply!");

        address _treasury = IGovernance(governance).treasury();
        uint256 totalPrice = _amount * price;
        uint256 payTokenAmount = ITreasury(_treasury).usdAmountToToken(totalPrice, _payToken);

        bool success = IERC20Metadata(_payToken).transferFrom(
            msg.sender,
            _treasury,
            payTokenAmount
        );
        require(success, "ERC20 transferFrom failed!");

        uint256 tokenId = nextTokenId++;
        amountInToken[tokenId] = _amount;
        tokenStakingStrategy[tokenId] = _stakingStrategy;

        _safeMint(msg.sender, tokenId);
        emit Mint(msg.sender, _payToken, tokenId, _amount);

        IStakingStrategy(_stakingStrategy).stake(address(this), tokenId, _payload);
    }

    // ------------------------------------------------------------------------------------
    // ----- PROTOCOL ACTIONS  ------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    function burn(uint256 _tokenId) external {
        IGovernance(governance).enforceIsStakingStrategyContract(msg.sender);
        _burn(_tokenId);
    }

    // ------------------------------------------------------------------------------------
    // ----- GOVERNANCE ACTIONS  ----------------------------------------------------------
    // ------------------------------------------------------------------------------------

    function stopSell() external {
        _enforceIsGovernance();
        maxSupply = totalMintedAmount;
    }

    function setNewMaxSupply(uint256 _maxSupply) external {
        _enforceIsGovernance();
        require(_maxSupply > maxSupply, "max supply less!");
        maxSupply = _maxSupply;
    }

    // ------------------------------------------------------------------------------------
    // ----- VIEW  ------------------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    function tokenPrice(uint256 _tokenId) external view returns (uint256) {
        return price * amountInToken[_tokenId];
    }

    // ------------------------------------------------------------------------------------
    // ----- INTERNAL  --------------------------------------------------------------------
    // ------------------------------------------------------------------------------------

    function _enfroceIsTokenOwner(uint256 _tokenId) internal view {
        require(ownerOf(_tokenId) == msg.sender, "tokenOwner!");
    }
}

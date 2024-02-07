// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

interface IItem {
    function burn(uint256 _tokenId) external;

    function price() external view returns (uint256);

    function maxSupply() external returns (uint256);

    function totalMintedAmount() external returns (uint256);

    function tokenStakingStrategy(uint256 _tokenId) external returns (address);

    function mint(address _stakingStrategy, address _payToken, uint256 _maxPayTokenAmount, bytes memory _payload) external;

    function stopSell() external;

    function setNewMaxSupply(uint256 _maxSupply) external;
}

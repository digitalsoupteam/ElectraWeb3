// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

import { ERC1155 } from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

contract StakingERC1155 is ERC1155 {
    constructor() ERC1155("") {}
}

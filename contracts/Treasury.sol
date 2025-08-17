// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import {Campaign} from "./Campaign.sol";

contract Treasury is Ownable {
    error AlreadyReleased();

    using Address for address payable;

    Campaign public campaign;
    uint256 public totalFunds;
    mapping(uint256 => Milestone) public milestones;

    struct Milestone {
        uint256 amount;
        bool released;
        string description;
    }

    event MilestoneFunded(uint256 id, uint256 amount);
    event MilestoneReleased(uint256 id, address to);

    constructor(address _campaign) Ownable(msg.sender) {
        campaign = Campaign(payable(_campaign));
    }

    receive() external payable {
        totalFunds += msg.value;
    }

    function fund() external payable {
        totalFunds += msg.value;
        emit MilestoneFunded(0, msg.value);
    }

    function addMilestone(uint256 id, uint256 amount, string memory desc) external onlyOwner {
        milestones[id] = Milestone(amount, false, desc);
    }

    function releaseMilestone(uint256 id) external onlyOwner {
        Milestone storage m = milestones[id];
        require(m.amount > 0, "Invalid milestone");
        if (m.released) revert AlreadyReleased();
        require(address(this).balance >= m.amount, "Insufficient funds");

        m.released = true;
        payable(campaign.beneficiary()).sendValue(m.amount);
        emit MilestoneReleased(id, campaign.beneficiary());
    }

}

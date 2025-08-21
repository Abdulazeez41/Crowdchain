// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract Campaign is Ownable, Initializable, ReentrancyGuard {
    using Address for address payable;

    enum State { Funding, Success, Failed, Closed }
    State public state;

    string public name;
    string public description;
    uint256 public goal;
    uint256 public deadline;
    address public beneficiary;
    address public creator;

    uint256 public totalFunded;
    mapping(address => uint256) public contributions;

    event Funded(address indexed backer, uint256 amount, uint256 timestamp);
    event GoalReached(uint256 amount);
    event Refunded(address indexed backer, uint256 amount);

    constructor() Ownable(msg.sender) {}

    function initialize(
        string memory _name,
        string memory _description,
        uint256 _goal,
        uint256 _durationDays,
        address _beneficiary,
        address _owner
    ) external initializer {
        name = _name;
        description = _description;
        goal = _goal;
        deadline = block.timestamp + (_durationDays * 1 days);
        beneficiary = _beneficiary;
        creator = _owner;
        state = State.Funding;
        _transferOwnership(_owner);
    }

    receive() external payable {
        fund();
    }

    function fund() public payable {
        require(state == State.Funding, "Campaign not active");
        require(block.timestamp < deadline, "Deadline passed");

        contributions[msg.sender] += msg.value;
        totalFunded += msg.value;

        emit Funded(msg.sender, msg.value, block.timestamp);

        if (totalFunded >= goal) {
            state = State.Success;
            emit GoalReached(totalFunded);
        }
    }

    function withdraw() external nonReentrant {
        require(state == State.Success, "Goal not reached");
        require(msg.sender == beneficiary, "Not beneficiary");
        
        state = State.Closed;
        (bool sent, ) = payable(beneficiary).call{value: address(this).balance}("");
        require(sent, "Failed to send ETH");
    }

    function refund() external nonReentrant {
        require(block.timestamp >= deadline && totalFunded < goal, "Refunds not allowed");
        uint256 amount = contributions[msg.sender];
        require(amount > 0, "No contribution");
        contributions[msg.sender] = 0;
        (bool sent, ) = payable(msg.sender).call{value: amount}("");
        require(sent, "Failed to send ETH");
        emit Refunded(msg.sender, amount);
    }

    // --- Called by Governor or external logic ---
    function finalize() external onlyOwner {
        require(block.timestamp >= deadline, "Campaign still active");
        if (totalFunded < goal) {
            state = State.Failed;
        } else {
            state = State.Closed;
        }
    }

    // --- Fallback in case of stuck ETH ---
    function recover() external onlyOwner {
        payable(owner()).sendValue(address(this).balance);
    }

    // --- View Helpers ---
    function goalReached() external view returns (bool) {
        return totalFunded >= goal;
    }

    function isActive() external view returns (bool) {
        return state == State.Funding && block.timestamp < deadline;
    }
}
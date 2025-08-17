require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
  console.log("🗳️ Voting on Proposal...\n");

  const deployer = new ethers.Wallet(process.env.PRIVATE_KEY, ethers.provider);

  const GOVERNOR_ADDR = process.env.GOVERNOR_ADDR;
  const PROPOSAL_ID = process.env.PROPOSAL_ID;

  if (!GOVERNOR_ADDR || !PROPOSAL_ID) {
    throw new Error("❌ Missing GOVERNOR_ADDR or PROPOSAL_ID in .env");
  }

  const Governor = await ethers.getContractFactory("MyGovernor");
  const governor = Governor.attach(GOVERNOR_ADDR);

  const state = await governor.state(PROPOSAL_ID);
  const states = [
    "Pending",
    "Active",
    "Defeated",
    "Succeeded",
    "Queued",
    "Executed",
    "Expired",
    "Canceled",
  ];

  console.log(`📌 Proposal State: ${states[state]} (${state})`);

  if (state !== 1) {
    throw new Error(
      `❌ Cannot vote: proposal is ${states[state]}. Wait until it's Active.`
    );
  }

  console.log("🗳️ Casting vote...");
  const tx = await governor.castVote(PROPOSAL_ID, 1);
  await tx.wait();

  console.log("✅ Vote cast successfully!\n");

  const votes = await governor.proposalVotes(PROPOSAL_ID);
  console.log(
    `📊 Current votes: For=${ethers.formatEther(
      votes.forVotes
    )} | Against=${ethers.formatEther(votes.againstVotes)}`
  );
}

main().catch(console.error);

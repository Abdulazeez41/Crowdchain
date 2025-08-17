require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
  const GOVERNOR_ADDR = process.env.GOVERNOR_ADDR;
  const Governor = await ethers.getContractFactory("MyGovernor");
  const governor = Governor.attach(GOVERNOR_ADDR);

  const proposalId =
    "60589340038213486237031832011176188945356825579692811880241531356649488589721";

  console.log("📡 Debugging Proposal:", proposalId);

  try {
    const snapshot = await governor.proposalSnapshot(proposalId);
    const deadline = await governor.proposalDeadline(proposalId);
    const state = await governor.state(proposalId);
    const proposer = await governor.proposalProposer(proposalId);

    console.log("📊 Proposal Data:");
    console.log("   Snapshot:", snapshot.toString());
    console.log("   Deadline:", deadline.toString());
    console.log("   State:", state);
    console.log("   Proposer:", proposer);
  } catch (err) {
    console.error("❌ Failed to read proposal:", err.message);
  }
}

main();

const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DAO Flow with Treasury + Governor + CampaignFactory", function () {
  let deployer, alice, bob;
  let timelock, token, governor, factory, treasury;

  const MIN_DELAY = 3600; // 1 hour (for Timelock)

  beforeEach(async function () {
    [deployer, alice, bob] = await ethers.getSigners();

    // 1. Deploy TimelockController
    const TimelockController = await ethers.getContractFactory(
      "TimelockController"
    );
    timelock = await TimelockController.deploy(
      MIN_DELAY,
      [deployer.address],
      [deployer.address],
      deployer.address
    );
    await timelock.waitForDeployment();

    // 2. Deploy Token
    const Token = await ethers.getContractFactory("CrowdchainGovernor");
    token = await Token.deploy(deployer.address);
    await token.waitForDeployment();

    // 3. Deploy Governor
    const Governor = await ethers.getContractFactory("MyGovernor");
    governor = await Governor.deploy(token.target, timelock.target);
    await governor.waitForDeployment();

    // 4. Deploy Factory
    const Factory = await ethers.getContractFactory("CampaignFactory");
    factory = await Factory.deploy();
    await factory.waitForDeployment();

    // 5. Create Campaign
    const tx = await factory.createCampaign(
      "Test Campaign",
      "A campaign for testing",
      ethers.parseEther("10"),
      30,
      alice.address
    );
    const receipt = await tx.wait();
    const event = receipt.logs.find(
      (log) => log.fragment?.name === "CampaignCreated"
    );
    const campaignAddress = event.args.campaign;

    // 6. Deploy Treasury
    const Treasury = await ethers.getContractFactory("Treasury");
    treasury = await Treasury.deploy(campaignAddress);
    await treasury.waitForDeployment();

    // ✅ Transfer ownership to Timelock
    await treasury.transferOwnership(timelock.target);

    // 7. Grant roles to Governor
    const DEFAULT_ADMIN_ROLE = await timelock.DEFAULT_ADMIN_ROLE();
    const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
    const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();

    await timelock
      .connect(deployer)
      .grantRole(DEFAULT_ADMIN_ROLE, governor.target);
    await timelock.connect(deployer).grantRole(PROPOSER_ROLE, governor.target);
    await timelock.connect(deployer).grantRole(EXECUTOR_ROLE, governor.target);

    // 8. Mint & delegate
    await token.mint(alice.address, ethers.parseEther("100"));
    await token.mint(bob.address, ethers.parseEther("100"));
    await token.connect(alice).delegate(alice.address);
    await token.connect(bob).delegate(bob.address);
  });

  it("should deploy correctly", async function () {
    expect(await treasury.owner()).to.equal(timelock.target);
    expect(await treasury.campaign()).to.be.properAddress;
  });

  it("should allow creating campaigns from factory", async function () {
    const tx = await factory.createCampaign(
      "Education Fund",
      "Fund education access",
      ethers.parseEther("10"),
      30,
      alice.address
    );

    const receipt = await tx.wait();
    const event = receipt.logs.find(
      (l) => l.fragment?.name === "CampaignCreated"
    );
    const [campaignAddr, creator, , goal] = event.args;

    expect(campaignAddr).to.be.properAddress;
    expect(creator).to.equal(deployer.address);
    expect(goal).to.equal(ethers.parseEther("10"));
  });

  it("should execute a governance proposal to add and release a milestone via Treasury", async function () {
    const campaignAddr = await treasury.campaign();

    // Fund Treasury
    await deployer.sendTransaction({
      to: treasury.target,
      value: ethers.parseEther("50"),
    });

    expect(await ethers.provider.getBalance(treasury.target)).to.equal(
      ethers.parseEther("50")
    );

    // --- PROPOSAL 1: Add Milestone ---
    const addMilestoneCall = treasury.interface.encodeFunctionData(
      "addMilestone",
      [1, ethers.parseEther("10"), "Purchase school supplies"]
    );

    const proposeAddTx = await governor
      .connect(alice)
      .propose([treasury.target], [0], [addMilestoneCall], "Add milestone 1");

    const addReceipt = await proposeAddTx.wait();
    const addEvent = addReceipt.logs.find(
      (l) => l.fragment?.name === "ProposalCreated"
    );
    const addProposalId = addEvent.args.proposalId;

    await ethers.provider.send("evm_mine");
    await ethers.provider.send("evm_mine");

    console.log("Add Proposal State:", await governor.state(addProposalId));

    await governor.connect(alice).castVote(addProposalId, 1);
    await governor.connect(bob).castVote(addProposalId, 1);

    for (let i = 0; i < 50; i++) await ethers.provider.send("evm_mine");

    const addDescriptionHash = ethers.id("Add milestone 1");
    await governor.queue(
      [treasury.target],
      [0],
      [addMilestoneCall],
      addDescriptionHash
    );

    await ethers.provider.send("evm_increaseTime", [MIN_DELAY]);
    await ethers.provider.send("evm_mine");

    await governor.execute(
      [treasury.target],
      [0],
      [addMilestoneCall],
      addDescriptionHash
    );

    expect((await treasury.milestones(1)).amount).to.equal(
      ethers.parseEther("10")
    );

    // --- PROPOSAL 2: Release Milestone ---
    const releaseCall = treasury.interface.encodeFunctionData(
      "releaseMilestone",
      [1]
    );

    const proposeReleaseTx = await governor
      .connect(alice)
      .propose([treasury.target], [0], [releaseCall], "Release milestone 1");

    const releaseReceipt = await proposeReleaseTx.wait();
    const releaseEvent = releaseReceipt.logs.find(
      (l) => l.fragment?.name === "ProposalCreated"
    );
    const releaseProposalId = releaseEvent.args.proposalId;

    await ethers.provider.send("evm_mine");
    await ethers.provider.send("evm_mine");

    console.log(
      "Release Proposal State:",
      await governor.state(releaseProposalId)
    );

    await governor.connect(alice).castVote(releaseProposalId, 1);
    await governor.connect(bob).castVote(releaseProposalId, 1);

    for (let i = 0; i < 50; i++) await ethers.provider.send("evm_mine");

    const releaseDescriptionHash = ethers.id("Release milestone 1");
    await governor.queue(
      [treasury.target],
      [0],
      [releaseCall],
      releaseDescriptionHash
    );

    await ethers.provider.send("evm_increaseTime", [MIN_DELAY]);
    await ethers.provider.send("evm_mine");

    await governor.execute(
      [treasury.target],
      [0],
      [releaseCall],
      releaseDescriptionHash
    );

    const milestone = await treasury.milestones(1);
    expect(milestone.released).to.be.true;
    expect(milestone.amount).to.equal(ethers.parseEther("10"));
    expect(milestone.description).to.equal("Purchase school supplies");
  });
});

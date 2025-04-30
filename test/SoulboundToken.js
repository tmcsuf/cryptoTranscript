const { expect } = require("chai");
const { ethers } = require("hardhat");

// Enum values for BurnAuth
const BurnAuth = {
  IssuerOnly: 0,
  OwnerOnly: 1,
  Both: 2,
  Neither: 3
};

describe("SoulboundToken", function () {
  let soulboundToken;
  let owner;
  let minter;
  let user;
  let admin;
  let nextTokenId;

  // Sample data hashes for testing
  const sampleCourseHash = "0x1234567890123456789012345678901234567890123456789012345678901234";
  const sampleDiplomaHash = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

  beforeEach(async function () {
    [owner, minter, user, admin] = await ethers.getSigners();
    nextTokenId = 0;

    const SoulboundToken = await ethers.getContractFactory("SoulboundToken");
    soulboundToken = await SoulboundToken.deploy(admin.address, "Soulbound Transcript", "SBT");
    await soulboundToken.waitForDeployment();
  });

  async function mintToken(to, burnAuth, dataHash) {
    await soulboundToken.connect(admin).SBTmint(to, burnAuth, dataHash);
    const tokenId = nextTokenId;
    nextTokenId++;
    return tokenId;
  }

  describe("Deployment", function () {
    it("Should set the right owner and admin", async function () {
      expect(await soulboundToken.hasRole(await soulboundToken.ADMIN_ROLE(), admin.address)).to.be.true;
      expect(await soulboundToken.hasRole(await soulboundToken.MINTER_ROLE(), admin.address)).to.be.true;
    });

    it("Should set the correct name and symbol", async function () {
      expect(await soulboundToken.name()).to.equal("Soulbound Transcript");
      expect(await soulboundToken.symbol()).to.equal("SBT");
    });
  });

  describe("Token Minting", function () {
    it("Should allow admin to mint tokens with data hash", async function () {
      const tokenId = await mintToken(user.address, BurnAuth.IssuerOnly, sampleCourseHash);
      
      expect(await soulboundToken.ownerOf(tokenId)).to.equal(user.address);
      expect(await soulboundToken.getDataHash(tokenId)).to.equal(sampleCourseHash);
      expect(await soulboundToken.burnAuth(tokenId)).to.equal(BurnAuth.IssuerOnly);
      expect(await soulboundToken.issuerOf(tokenId)).to.equal(admin.address);
    });

    it("Should not allow non-minters to mint tokens", async function () {
      await expect(
        soulboundToken.connect(user).SBTmint(user.address, BurnAuth.IssuerOnly, sampleCourseHash)
      ).to.be.revertedWithCustomError(soulboundToken, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Data Hash Management", function () {
    let tokenId;

    beforeEach(async function () {
      tokenId = await mintToken(user.address, BurnAuth.IssuerOnly, sampleCourseHash);
    });

    it("Should allow minter to update data hash", async function () {
      const newHash = "0x9876543210987654321098765432109876543210987654321098765432109876";
      await soulboundToken.connect(admin).updateDataHash(tokenId, newHash);
      expect(await soulboundToken.getDataHash(tokenId)).to.equal(newHash);
    });

    it("Should not allow non-minters to update data hash", async function () {
      const newHash = "0x9876543210987654321098765432109876543210987654321098765432109876";
      await expect(
        soulboundToken.connect(user).updateDataHash(tokenId, newHash)
      ).to.be.revertedWithCustomError(soulboundToken, "AccessControlUnauthorizedAccount");
    });

    it("Should not allow updating hash for non-existent token", async function () {
      const newHash = "0x9876543210987654321098765432109876543210987654321098765432109876";
      await expect(
        soulboundToken.connect(admin).updateDataHash(999, newHash)
      ).to.be.revertedWithCustomError(soulboundToken, "ERC721NonexistentToken");
    });
  });

  describe("Role Management", function () {
    it("Should allow admin to add and remove minters", async function () {
      await soulboundToken.connect(admin).addMinter(minter.address);
      expect(await soulboundToken.hasRole(await soulboundToken.MINTER_ROLE(), minter.address)).to.be.true;

      await soulboundToken.connect(admin).removeMinter(minter.address);
      expect(await soulboundToken.hasRole(await soulboundToken.MINTER_ROLE(), minter.address)).to.be.false;
    });

    it("Should not allow non-admins to manage roles", async function () {
      await expect(
        soulboundToken.connect(user).addMinter(minter.address)
      ).to.be.revertedWithCustomError(soulboundToken, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Burning", function () {
    let issuerOnlyTokenId;

    beforeEach(async function () {
      issuerOnlyTokenId = await mintToken(user.address, BurnAuth.IssuerOnly, sampleCourseHash);
    });

    it("Should allow issuer to burn token with IssuerOnly auth", async function () {
      await soulboundToken.connect(admin).burn(issuerOnlyTokenId);
      await expect(soulboundToken.ownerOf(issuerOnlyTokenId))
        .to.be.revertedWithCustomError(soulboundToken, "ERC721NonexistentToken");
    });

    it("Should not allow owner to burn token with IssuerOnly auth", async function () {
      await expect(
        soulboundToken.connect(user).burn(issuerOnlyTokenId)
      ).to.be.revertedWith("ERC5484: only issuer can burn");
    });

    it("Should allow owner to burn token with OwnerOnly auth", async function () {
      const tokenId = await mintToken(user.address, BurnAuth.OwnerOnly, sampleCourseHash);
      await soulboundToken.connect(user).burn(tokenId);
      await expect(soulboundToken.ownerOf(tokenId))
        .to.be.revertedWithCustomError(soulboundToken, "ERC721NonexistentToken");
    });

    it("Should allow both owner and issuer to burn token with Both auth", async function () {
      // Test owner can burn
      const ownerTokenId = await mintToken(user.address, BurnAuth.Both, sampleCourseHash);
      await soulboundToken.connect(user).burn(ownerTokenId);
      await expect(soulboundToken.ownerOf(ownerTokenId))
        .to.be.revertedWithCustomError(soulboundToken, "ERC721NonexistentToken");

      // Test issuer can burn
      const issuerTokenId = await mintToken(user.address, BurnAuth.Both, sampleCourseHash);
      await soulboundToken.connect(admin).burn(issuerTokenId);
      await expect(soulboundToken.ownerOf(issuerTokenId))
        .to.be.revertedWithCustomError(soulboundToken, "ERC721NonexistentToken");
    });

    it("Should not allow burning token with Neither auth", async function () {
      const tokenId = await mintToken(user.address, BurnAuth.Neither, sampleCourseHash);
      
      // Try to burn as issuer
      await expect(
        soulboundToken.connect(admin).burn(tokenId)
      ).to.be.revertedWith("ERC5484: token cannot be burned");

      // Try to burn as owner
      await expect(
        soulboundToken.connect(user).burn(tokenId)
      ).to.be.revertedWith("ERC5484: token cannot be burned");

      // Verify token still exists
      expect(await soulboundToken.ownerOf(tokenId)).to.equal(user.address);
    });
  });

  describe("Non-transferability", function () {
    let tokenId;

    beforeEach(async function () {
      tokenId = await mintToken(user.address, BurnAuth.IssuerOnly, sampleCourseHash);
    });

    it("Should not allow token transfer", async function () {
      await expect(
        soulboundToken.connect(user).transferFrom(user.address, minter.address, tokenId)
      ).to.be.revertedWith("ERC5484: token is non-transferable");
    });

    it("Should not allow safe token transfer", async function () {
      await expect(
        soulboundToken.connect(user).safeTransferFrom(user.address, minter.address, tokenId)
      ).to.be.revertedWith("ERC5484: token is non-transferable");
    });
  });
}); 
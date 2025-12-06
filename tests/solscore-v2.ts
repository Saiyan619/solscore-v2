import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Solscore } from "../target/types/solscore";
import { 
  PublicKey, 
  Keypair, 
  SystemProgram,
  LAMPORTS_PER_SOL 
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAccount,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { assert } from "chai";

describe("solscore", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Solscore as Program<Solscore>;
  
  let mint: PublicKey;
  let admin: Keypair;
  let adminTokenAccount: PublicKey;
  
  // Pre-funded test users (reused across tests)
  let testUser1: Keypair;
  let testUser1TokenAccount: PublicKey;
  let testUser2: Keypair;
  let testUser2TokenAccount: PublicKey;

  before(async () => {
    // Use provider wallet as admin
    admin = (provider.wallet as any).payer;
    
    // Create mint
    mint = await createMint(
      provider.connection,
      admin,
      admin.publicKey,
      null,
      6
    );

    // Create admin token account
    adminTokenAccount = await createAccount(
      provider.connection,
      admin,
      mint,
      admin.publicKey
    );

    // Mint tokens to admin
    await mintTo(
      provider.connection,
      admin,
      mint,
      adminTokenAccount,
      admin,
      1_000_000_000_000
    );

    // Create and fund test users ONCE for all tests
    console.log("Setting up test users...");
    
    // Test User 1
    testUser1 = Keypair.generate();
    try {
      const airdrop1 = await provider.connection.requestAirdrop(
        testUser1.publicKey,
        5 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdrop1);
      console.log("Test user 1 funded");
    } catch (error) {
      console.log("Airdrop for test user 1 failed, but continuing...");
    }

    testUser1TokenAccount = await createAccount(
      provider.connection,
      admin, // Admin pays for account creation
      mint,
      testUser1.publicKey
    );

    await mintTo(
      provider.connection,
      admin,
      mint,
      testUser1TokenAccount,
      admin,
      100_000_000
    );

    // Test User 2
    testUser2 = Keypair.generate();
    try {
      const airdrop2 = await provider.connection.requestAirdrop(
        testUser2.publicKey,
        5 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdrop2);
      console.log("Test user 2 funded");
    } catch (error) {
      console.log("Airdrop for test user 2 failed, but continuing...");
    }

    testUser2TokenAccount = await createAccount(
      provider.connection,
      admin,
      mint,
      testUser2.publicKey
    );

    await mintTo(
      provider.connection,
      admin,
      mint,
      testUser2TokenAccount,
      admin,
      100_000_000
    );

    console.log("Test setup complete");
  });

  describe("initialize_market", () => {
    it("Successfully initializes a market", async () => {
      const leagueName = "NBA";
      const season = Date.now().toString();
      const teams = ["Lakers", "Celtics"];
      const odds = [new anchor.BN(2), new anchor.BN(3)];
      const maxStakeAmount = new anchor.BN(1000);
      const allowedBettors = new anchor.BN(10);

      const [marketPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), Buffer.from(leagueName), Buffer.from(season)],
        program.programId
      );

      const vaultPda = await getAssociatedTokenAddress(
        mint,
        marketPda,
        true
      );

      await program.methods
        .initializeMarket(
          leagueName,
          season,
          teams,
          odds,
          maxStakeAmount,
          allowedBettors
        )
        .accounts({
          market: marketPda,
          vault: vaultPda,
          mint: mint,
          admin: admin.publicKey,
          adminTokenAccount: adminTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      const marketAccount = await program.account.market.fetch(marketPda);
      
      assert.equal(marketAccount.admin.toString(), admin.publicKey.toString());
      assert.equal(marketAccount.leagueName, leagueName);
      assert.equal(marketAccount.season, season);
      assert.deepEqual(marketAccount.teams, teams);
      assert.equal(marketAccount.isResolved, false);
      assert.equal(marketAccount.maxStakeAmount.toNumber(), maxStakeAmount.toNumber());
      assert.equal(marketAccount.allowedBettors.toNumber(), allowedBettors.toNumber());

      const vaultAccount = await getAccount(provider.connection, vaultPda);
      const highestOdd = Math.max(...odds.map(o => o.toNumber()));
      const expectedAmount = maxStakeAmount.toNumber() * highestOdd * allowedBettors.toNumber();
      assert.equal(Number(vaultAccount.amount), expectedAmount);
    });

    it("Fails with empty teams array", async () => {
      const leagueName = "EPL";
      const season = Date.now().toString();

      const [marketPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), Buffer.from(leagueName), Buffer.from(season)],
        program.programId
      );

      const vaultPda = await getAssociatedTokenAddress(mint, marketPda, true);

      try {
        await program.methods
          .initializeMarket(
            leagueName,
            season,
            [],
            [],
            new anchor.BN(1000),
            new anchor.BN(10)
          )
          .accounts({
            market: marketPda,
            vault: vaultPda,
            mint: mint,
            admin: admin.publicKey,
            adminTokenAccount: adminTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([admin])
          .rpc();
        
        assert.fail("Expected error");
      } catch (error) {
        assert.include(error.message, "EmptyTeamsOrOdds");
      }
    });

    it("Fails with mismatched teams and odds length", async () => {
      const leagueName = "NFL";
      const season = Date.now().toString();

      const [marketPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), Buffer.from(leagueName), Buffer.from(season)],
        program.programId
      );

      const vaultPda = await getAssociatedTokenAddress(mint, marketPda, true);

      try {
        await program.methods
          .initializeMarket(
            leagueName,
            season,
            ["Patriots", "Cowboys", "Eagles"],
            [new anchor.BN(2), new anchor.BN(3)],
            new anchor.BN(1000),
            new anchor.BN(10)
          )
          .accounts({
            market: marketPda,
            vault: vaultPda,
            mint: mint,
            admin: admin.publicKey,
            adminTokenAccount: adminTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([admin])
          .rpc();
        
        assert.fail("Expected error");
      } catch (error: any) {
        const errorString = error.toString();
        assert.include(errorString, "TeamsAndOddsLengthMismatch");
      }
    });
  });

  describe("place_bet", () => {
    let marketPda: PublicKey;
    let vaultPda: PublicKey;

    before(async () => {
      const leagueName = "NHL";
      const season = Date.now().toString();
      const teams = ["Rangers", "Bruins"];
      const odds = [new anchor.BN(2), new anchor.BN(3)];

      [marketPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), Buffer.from(leagueName), Buffer.from(season)],
        program.programId
      );

      vaultPda = await getAssociatedTokenAddress(mint, marketPda, true);

      await program.methods
        .initializeMarket(
          leagueName,
          season,
          teams,
          odds,
          new anchor.BN(1000),
          new anchor.BN(10)
        )
        .accounts({
          market: marketPda,
          vault: vaultPda,
          mint: mint,
          admin: admin.publicKey,
          adminTokenAccount: adminTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();
    });

    it("Successfully places a bet", async () => {
      const [betPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("bet"), testUser1.publicKey.toBuffer(), marketPda.toBuffer()],
        program.programId
      );

      const teamIndex = 0;
      const amount = new anchor.BN(500);

      const userBalanceBefore = await getAccount(provider.connection, testUser1TokenAccount);

      await program.methods
        .placeBet(teamIndex, amount)
        .accounts({
          bet: betPda,
          market: marketPda,
          vault: vaultPda,
          userTokenAccount: testUser1TokenAccount,
          user: testUser1.publicKey,
          mint: mint,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([testUser1])
        .rpc();

      const betAccount = await program.account.bet.fetch(betPda);
      assert.equal(betAccount.user.toString(), testUser1.publicKey.toString());
      assert.equal(betAccount.teamIndex, teamIndex);
      assert.equal(betAccount.amount.toNumber(), amount.toNumber());

      const userBalanceAfter = await getAccount(provider.connection, testUser1TokenAccount);
      assert.equal(
        Number(userBalanceBefore.amount) - Number(userBalanceAfter.amount),
        amount.toNumber()
      );
    });

    it("Fails when betting zero amount", async () => {
      const [betPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("bet"), testUser2.publicKey.toBuffer(), marketPda.toBuffer()],
        program.programId
      );

      try {
        await program.methods
          .placeBet(0, new anchor.BN(0))
          .accounts({
            bet: betPda,
            market: marketPda,
            vault: vaultPda,
            userTokenAccount: testUser2TokenAccount,
            user: testUser2.publicKey,
            mint: mint,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([testUser2])
          .rpc();
        
        assert.fail("Expected error");
      } catch (error) {
        assert.include(error.message, "InvalidBetAmount");
      }
    });

    it("Fails with invalid team index", async () => {
      // Create a new token account for admin to use in this test
      const adminBetTokenAccount = await createAccount(
        provider.connection,
        admin,
        mint,
        admin.publicKey
      );

      await mintTo(
        provider.connection,
        admin,
        mint,
        adminBetTokenAccount,
        admin,
        10_000_000
      );

      const [betPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("bet"), admin.publicKey.toBuffer(), marketPda.toBuffer()],
        program.programId
      );

      try {
        await program.methods
          .placeBet(5, new anchor.BN(500))
          .accounts({
            bet: betPda,
            market: marketPda,
            vault: vaultPda,
            userTokenAccount: adminBetTokenAccount,
            user: admin.publicKey,
            mint: mint,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([admin])
          .rpc();
        
        assert.fail("Expected error");
      } catch (error) {
        assert.include(error.message, "InvalidTeamIndex");
      }
    });
  });

  describe("resolve_market", () => {
    let marketPda: PublicKey;
    let vaultPda: PublicKey;

    before(async () => {
      const leagueName = "MLS";
      const season = Date.now().toString();

      [marketPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), Buffer.from(leagueName), Buffer.from(season)],
        program.programId
      );

      vaultPda = await getAssociatedTokenAddress(mint, marketPda, true);

      await program.methods
        .initializeMarket(
          leagueName,
          season,
          ["Fire", "Galaxy"],
          [new anchor.BN(2), new anchor.BN(3)],
          new anchor.BN(1000),
          new anchor.BN(10)
        )
        .accounts({
          market: marketPda,
          vault: vaultPda,
          mint: mint,
          admin: admin.publicKey,
          adminTokenAccount: adminTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();
    });

    it("Successfully resolves a market", async () => {
      const winningTeamIndex = 1;

      await program.methods
        .resolveMarket(winningTeamIndex)
        .accounts({
          market: marketPda,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      const marketAccount = await program.account.market.fetch(marketPda);
      assert.equal(marketAccount.isResolved, true);
      assert.equal(marketAccount.winningTeamIndex, winningTeamIndex);
      assert.isNotNull(marketAccount.resolvedAt);
    });

    it("Fails to resolve with invalid team index", async () => {
      const leagueName = "LaLiga";
      const season = Date.now().toString();

      const [marketPda2] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), Buffer.from(leagueName), Buffer.from(season)],
        program.programId
      );

      const vaultPda2 = await getAssociatedTokenAddress(mint, marketPda2, true);

      await program.methods
        .initializeMarket(
          leagueName,
          season,
          ["Barcelona", "Madrid"],
          [new anchor.BN(2), new anchor.BN(3)],
          new anchor.BN(1000),
          new anchor.BN(10)
        )
        .accounts({
          market: marketPda2,
          vault: vaultPda2,
          mint: mint,
          admin: admin.publicKey,
          adminTokenAccount: adminTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      try {
        await program.methods
          .resolveMarket(10)
          .accounts({
            market: marketPda2,
            admin: admin.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([admin])
          .rpc();
        
        assert.fail("Expected error");
      } catch (error) {
        assert.include(error.message, "InvalidTeamIndex");
      }
    });

    it("Fails to resolve already resolved market", async () => {
      try {
        await program.methods
          .resolveMarket(0)
          .accounts({
            market: marketPda,
            admin: admin.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([admin])
          .rpc();
        
        assert.fail("Expected error");
      } catch (error) {
        assert.include(error.message, "MarketResolved");
      }
    });
  });

  describe("claim_payout", () => {
    let marketPda: PublicKey;
    let vaultPda: PublicKey;
    let winnerBetPda: PublicKey;
    let loserBetPda: PublicKey;

    before(async () => {
      const leagueName = "SerieA";
      const season = Date.now().toString();

      [marketPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), Buffer.from(leagueName), Buffer.from(season)],
        program.programId
      );

      vaultPda = await getAssociatedTokenAddress(mint, marketPda, true);

      await program.methods
        .initializeMarket(
          leagueName,
          season,
          ["Juve", "Milan"],
          [new anchor.BN(2), new anchor.BN(3)],
          new anchor.BN(1000),
          new anchor.BN(10)
        )
        .accounts({
          market: marketPda,
          vault: vaultPda,
          mint: mint,
          admin: admin.publicKey,
          adminTokenAccount: adminTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      // Winner bet (testUser1 bets on team 1)
      [winnerBetPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("bet"), testUser1.publicKey.toBuffer(), marketPda.toBuffer()],
        program.programId
      );

      await program.methods
        .placeBet(1, new anchor.BN(500))
        .accounts({
          bet: winnerBetPda,
          market: marketPda,
          vault: vaultPda,
          userTokenAccount: testUser1TokenAccount,
          user: testUser1.publicKey,
          mint: mint,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([testUser1])
        .rpc();

      // Loser bet (testUser2 bets on team 0)
      [loserBetPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("bet"), testUser2.publicKey.toBuffer(), marketPda.toBuffer()],
        program.programId
      );

      await program.methods
        .placeBet(0, new anchor.BN(500))
        .accounts({
          bet: loserBetPda,
          market: marketPda,
          vault: vaultPda,
          userTokenAccount: testUser2TokenAccount,
          user: testUser2.publicKey,
          mint: mint,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([testUser2])
        .rpc();

      // Resolve market with team 1 winning
      await program.methods
        .resolveMarket(1)
        .accounts({
          market: marketPda,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();
    });

    it("Successfully claims payout for winning bet", async () => {
      const winnerBalanceBefore = await getAccount(provider.connection, testUser1TokenAccount);

      await program.methods
        .claimPayout()
        .accounts({
          market: marketPda,
          vault: vaultPda,
          bet: winnerBetPda,
          userTokenAccount: testUser1TokenAccount,
          user: testUser1.publicKey,
          mint: mint,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([testUser1])
        .rpc();

      const winnerBalanceAfter = await getAccount(provider.connection, testUser1TokenAccount);
      
      const expectedPayout = 500 * 3;
      assert.equal(
        Number(winnerBalanceAfter.amount) - Number(winnerBalanceBefore.amount),
        expectedPayout
      );
    });

    it("Fails to claim payout for losing bet", async () => {
      try {
        await program.methods
          .claimPayout()
          .accounts({
            market: marketPda,
            vault: vaultPda,
            bet: loserBetPda,
            userTokenAccount: testUser2TokenAccount,
            user: testUser2.publicKey,
            mint: mint,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([testUser2])
          .rpc();
        
        assert.fail("Expected error");
      } catch (error) {
        assert.include(error.message, "BetNotWon");
      }
    });
  });

  describe("close_market", () => {
    let marketPda: PublicKey;
    let vaultPda: PublicKey;

    before(async () => {
      const leagueName = "Ligue1";
      const season = Date.now().toString();

      [marketPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), Buffer.from(leagueName), Buffer.from(season)],
        program.programId
      );

      vaultPda = await getAssociatedTokenAddress(mint, marketPda, true);

      await program.methods
        .initializeMarket(
          leagueName,
          season,
          ["PSG", "Lyon"],
          [new anchor.BN(2), new anchor.BN(3)],
          new anchor.BN(1000),
          new anchor.BN(10)
        )
        .accounts({
          market: marketPda,
          vault: vaultPda,
          mint: mint,
          admin: admin.publicKey,
          adminTokenAccount: adminTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      await program.methods
        .resolveMarket(0)
        .accounts({
          market: marketPda,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();
    });

    it("Successfully closes a resolved market", async () => {
      const adminBalanceBefore = await getAccount(provider.connection, adminTokenAccount);
      const vaultBalanceBefore = await getAccount(provider.connection, vaultPda);

      await program.methods
        .closeMarket()
        .accounts({
          market: marketPda,
          mint: mint,
          vault: vaultPda,
          adminTokenAccount: adminTokenAccount,
          admin: admin.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      const adminBalanceAfter = await getAccount(provider.connection, adminTokenAccount);

      assert.equal(
        Number(adminBalanceAfter.amount) - Number(adminBalanceBefore.amount),
        Number(vaultBalanceBefore.amount)
      );
    });

    it("Fails to close unresolved market", async () => {
      const leagueName = "Championship";
      const season = Date.now().toString();

      const [unresolvedMarketPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), Buffer.from(leagueName), Buffer.from(season)],
        program.programId
      );

      const unresolvedVaultPda = await getAssociatedTokenAddress(mint, unresolvedMarketPda, true);

      await program.methods
        .initializeMarket(
          leagueName,
          season,
          ["Leeds", "Forest"],
          [new anchor.BN(2), new anchor.BN(3)],
          new anchor.BN(1000),
          new anchor.BN(10)
        )
        .accounts({
          market: unresolvedMarketPda,
          vault: unresolvedVaultPda,
          mint: mint,
          admin: admin.publicKey,
          adminTokenAccount: adminTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      try {
        await program.methods
          .closeMarket()
          .accounts({
            market: unresolvedMarketPda,
            mint: mint,
            vault: unresolvedVaultPda,
            adminTokenAccount: adminTokenAccount,
            admin: admin.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([admin])
          .rpc();
        
        assert.fail("Expected error");
      } catch (error) {
        assert.include(error.message, "MarketNotResolved");
      }
    });
  });
});
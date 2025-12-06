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

  before(async () => {
    // Use provider wallet instead of generating new admin
    admin = (provider.wallet as any).payer;
    
    mint = await createMint(
      provider.connection,
      admin,
      admin.publicKey,
      null,
      6
    );

    adminTokenAccount = await createAccount(
      provider.connection,
      admin,
      mint,
      admin.publicKey
    );

    await mintTo(
      provider.connection,
      admin,
      mint,
      adminTokenAccount,
      admin,
      1_000_000_000_000
    );
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
    let user1: Keypair;
    let user1TokenAccount: PublicKey;

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

      user1 = Keypair.generate();
      const airdrop = await provider.connection.requestAirdrop(
        user1.publicKey,
        5 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdrop);

      user1TokenAccount = await createAccount(
        provider.connection,
        user1,
        mint,
        user1.publicKey
      );

      await mintTo(
        provider.connection,
        admin,
        mint,
        user1TokenAccount,
        admin,
        10_000_000
      );
    });

    it("Successfully places a bet", async () => {
      const [betPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("bet"), user1.publicKey.toBuffer(), marketPda.toBuffer()],
        program.programId
      );

      const teamIndex = 0;
      const amount = new anchor.BN(500);

      const userBalanceBefore = await getAccount(provider.connection, user1TokenAccount);

      await program.methods
        .placeBet(teamIndex, amount)
        .accounts({
          bet: betPda,
          market: marketPda,
          vault: vaultPda,
          userTokenAccount: user1TokenAccount,
          user: user1.publicKey,
          mint: mint,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([user1])
        .rpc();

      const betAccount = await program.account.bet.fetch(betPda);
      assert.equal(betAccount.user.toString(), user1.publicKey.toString());
      assert.equal(betAccount.teamIndex, teamIndex);
      assert.equal(betAccount.amount.toNumber(), amount.toNumber());

      const userBalanceAfter = await getAccount(provider.connection, user1TokenAccount);
      assert.equal(
        Number(userBalanceBefore.amount) - Number(userBalanceAfter.amount),
        amount.toNumber()
      );
    });

    it("Fails when betting zero amount", async () => {
      const user2 = Keypair.generate();
      const airdrop = await provider.connection.requestAirdrop(
        user2.publicKey,
        LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdrop);

      const user2TokenAccount = await createAccount(
        provider.connection,
        user2,
        mint,
        user2.publicKey
      );

      await mintTo(
        provider.connection,
        admin,
        mint,
        user2TokenAccount,
        admin,
        10_000_000
      );

      const [betPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("bet"), user2.publicKey.toBuffer(), marketPda.toBuffer()],
        program.programId
      );

      try {
        await program.methods
          .placeBet(0, new anchor.BN(0))
          .accounts({
            bet: betPda,
            market: marketPda,
            vault: vaultPda,
            userTokenAccount: user2TokenAccount,
            user: user2.publicKey,
            mint: mint,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([user2])
          .rpc();
        
        assert.fail("Expected error");
      } catch (error) {
        assert.include(error.message, "InvalidBetAmount");
      }
    });

    it("Fails with invalid team index", async () => {
      const user3 = Keypair.generate();
      const airdrop = await provider.connection.requestAirdrop(
        user3.publicKey,
        LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdrop);

      const user3TokenAccount = await createAccount(
        provider.connection,
        user3,
        mint,
        user3.publicKey
      );

      await mintTo(
        provider.connection,
        admin,
        mint,
        user3TokenAccount,
        admin,
        10_000_000
      );

      const [betPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("bet"), user3.publicKey.toBuffer(), marketPda.toBuffer()],
        program.programId
      );

      try {
        await program.methods
          .placeBet(5, new anchor.BN(500))
          .accounts({
            bet: betPda,
            market: marketPda,
            vault: vaultPda,
            userTokenAccount: user3TokenAccount,
            user: user3.publicKey,
            mint: mint,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([user3])
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
    const winner = Keypair.generate();
    let winnerTokenAccount: PublicKey;
    const loser = Keypair.generate();
    let loserTokenAccount: PublicKey;

    before(async () => {
      const leagueName = "SerieA";
      const season = Date.now().toString();

      const airdrop1 = await provider.connection.requestAirdrop(
        winner.publicKey,
        LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdrop1);

      const airdrop2 = await provider.connection.requestAirdrop(
        loser.publicKey,
        LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdrop2);

      winnerTokenAccount = await createAccount(
        provider.connection,
        winner,
        mint,
        winner.publicKey
      );

      loserTokenAccount = await createAccount(
        provider.connection,
        loser,
        mint,
        loser.publicKey
      );

      await mintTo(
        provider.connection,
        admin,
        mint,
        winnerTokenAccount,
        admin,
        10_000_000
      );

      await mintTo(
        provider.connection,
        admin,
        mint,
        loserTokenAccount,
        admin,
        10_000_000
      );

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

      [winnerBetPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("bet"), winner.publicKey.toBuffer(), marketPda.toBuffer()],
        program.programId
      );

      await program.methods
        .placeBet(1, new anchor.BN(500))
        .accounts({
          bet: winnerBetPda,
          market: marketPda,
          vault: vaultPda,
          userTokenAccount: winnerTokenAccount,
          user: winner.publicKey,
          mint: mint,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([winner])
        .rpc();

      [loserBetPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("bet"), loser.publicKey.toBuffer(), marketPda.toBuffer()],
        program.programId
      );

      await program.methods
        .placeBet(0, new anchor.BN(500))
        .accounts({
          bet: loserBetPda,
          market: marketPda,
          vault: vaultPda,
          userTokenAccount: loserTokenAccount,
          user: loser.publicKey,
          mint: mint,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([loser])
        .rpc();

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
      const winnerBalanceBefore = await getAccount(provider.connection, winnerTokenAccount);

      await program.methods
        .claimPayout()
        .accounts({
          market: marketPda,
          vault: vaultPda,
          bet: winnerBetPda,
          userTokenAccount: winnerTokenAccount,
          user: winner.publicKey,
          mint: mint,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([winner])
        .rpc();

      const winnerBalanceAfter = await getAccount(provider.connection, winnerTokenAccount);
      
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
            userTokenAccount: loserTokenAccount,
            user: loser.publicKey,
            mint: mint,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([loser])
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
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{transfer, Mint, Token, TokenAccount, Transfer},
};

use crate::error::SolscoreError;

use crate::state::Market;

pub fn _initialize_market(
    ctx: Context<InitializeMarket>,
    league_name: String,
    season: String,
    teams: Vec<String>,
    odds: Vec<u64>,
    max_stake_amount: u64,
    allowed_bettors: u64,
) -> Result<()> {
    require!(
        teams.len() > 1 && odds.len() > 1,
        SolscoreError::EmptyTeamsOrOdds
    );

    require!(
        teams.len() == odds.len(),
        SolscoreError::TeamsAndOddsLengthMismatch
    );

    let market = &mut ctx.accounts.market;
    let admin = &ctx.accounts.admin;
    let vault = &ctx.accounts.vault;
    let admin_token_account = &ctx.accounts.admin_token_account;
    let token_program = &ctx.accounts.token_program;

    // Fund the market vault with enough funds to cater for potential payouts
    let highest_odd = odds.iter().max().unwrap();
    let amount = max_stake_amount * highest_odd * allowed_bettors;

    // Check if Admin has enough funds before transfer
    require!(admin_token_account.amount >= amount, SolscoreError::InsufficientBalance);

    let transfer_accounts = Transfer {
        from: admin_token_account.to_account_info(),
        to: vault.to_account_info(),
        authority: admin.to_account_info(),
    };
    let transfer_ctx = CpiContext::new(token_program.to_account_info(), transfer_accounts);
    transfer(transfer_ctx, amount)?;

    market.set_inner(Market {
        admin: ctx.accounts.admin.key(),
        league_name: league_name,
        season: season,
        teams: teams,
        odds: odds,
        max_stake_amount: max_stake_amount,
        allowed_bettors: allowed_bettors,
        is_resolved: false,
        winning_team_index: None,
        bump: ctx.bumps.market,
        resolved_at: None,
    });

    msg!("Funding market vault with {} tokens", amount);
    
    Ok(())
}

#[derive(Accounts)]
#[instruction(league_name: String, season: String)]
pub struct InitializeMarket<'info> {
    //Market Pda and also the authority for the vault
    #[account(
        init,
        payer = admin,
        space = 8 + Market::INIT_SPACE,
        seeds = [b"market", league_name.as_bytes(), season.as_bytes()],
        bump
    )]
    pub market: Account<'info, Market>,

    //vault token account where the funds will be stored
    #[account(
        init,
        payer = admin,
        associated_token::mint = mint,
        associated_token::authority = market,
        associated_token::token_program = token_program
    )]
    pub vault: Account<'info, TokenAccount>,

    // Token used - USDC(devnet...for now)
    pub mint: Account<'info, Mint>,

    //Admin Signing the transaction for initialization
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = admin,
        associated_token::token_program = token_program
    )]
    pub admin_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,

    pub associated_token_program: Program<'info, AssociatedToken>,

    pub system_program: Program<'info, System>,
}

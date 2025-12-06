use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{transfer, Mint, Token, TokenAccount, Transfer},
};

use crate::error::SolscoreError;
use crate::state::{Bet, Market};

pub fn _claim_payout(ctx: Context<ClaimPayout>) -> Result<()> {
    let bet = &mut ctx.accounts.bet;
    let market = &ctx.accounts.market;
    let vault = &ctx.accounts.vault;
    let user_token_account = &ctx.accounts.user_token_account;
    let token_program = &ctx.accounts.token_program;

    require!(market.is_resolved, SolscoreError::MarketNotResolved);
    require!(
        bet.team_index == market.winning_team_index.unwrap(),
        SolscoreError::BetNotWon
    );

    let transfer_accounts = Transfer {
        from: vault.to_account_info(),
        to: user_token_account.to_account_info(),
        authority: market.to_account_info(),
    };

    let seeds = &[
        b"market",
        market.league_name.as_str().as_bytes(),
        market.season.as_str().as_bytes(),
        &[market.bump],
    ];
    let signer_seeds = &[&seeds[..]];

    let transfer_ctx = CpiContext::new_with_signer(
        token_program.to_account_info(),
        transfer_accounts,
        signer_seeds,
    );

    transfer(transfer_ctx, bet.payout_amount.unwrap())?;

    Ok(())
}

#[derive(Accounts)]
pub struct ClaimPayout<'info> {
    #[account(
        mut,
        seeds = [b"market", market.league_name.as_bytes(), market.season.as_bytes()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = market,
        associated_token::token_program = token_program
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        has_one = user,
        seeds = [b"bet", user.key().as_ref(), market.key().as_ref()],
        bump = bet.bump,
        close = user
    )]
    pub bet: Account<'info, Bet>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = user,
        associated_token::token_program = token_program
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,

    pub associated_token_program: Program<'info, AssociatedToken>,

    pub system_program: Program<'info, System>,
}

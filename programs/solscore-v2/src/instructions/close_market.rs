use anchor_lang::prelude::*;

use anchor_spl::{
    associated_token::AssociatedToken,
    token::{close_account, transfer, CloseAccount, Mint, Token, TokenAccount, Transfer},
};

use crate::error::SolscoreError;

use crate::state::{Bet, Market};

pub fn _close_market(ctx: Context<CloseMarket>) -> Result<()> {
    let market = &ctx.accounts.market;
    let vault = &ctx.accounts.vault;
    let admin = &ctx.accounts.admin;
    let admin_token_account = &ctx.accounts.admin_token_account;
    let token_program = &ctx.accounts.token_program;

    require!(market.is_resolved, SolscoreError::MarketNotResolved);

    // Transfer all the money in the vault to the admin
    let transfer_accounts = Transfer {
        from: vault.to_account_info(),
        to: admin_token_account.to_account_info(),
        authority: market.to_account_info(),
    };

    let seeds = &[
        b"market",
        market.league_name.as_str().as_bytes(),
        market.season.as_str().as_bytes(),
        &[market.bump],
    ];
    let signer_seeds = [&seeds[..]];

    let transfer_ctx = CpiContext::new_with_signer(
        token_program.to_account_info(),
        transfer_accounts,
        &signer_seeds,
    );

    transfer(transfer_ctx, vault.amount)?;

    // Close the vault account
    let close_accounts = CloseAccount {
        account: vault.to_account_info(),
        destination: admin.to_account_info(),
        authority: market.to_account_info(),
    };

    let close_ctx = CpiContext::new_with_signer(
        token_program.to_account_info(),
        close_accounts,
        &signer_seeds,
    );

    close_account(close_ctx)?;

    msg!(
        "Market closed for betting: {} {}",
        market.league_name,
        market.season
    );

    Ok(())
}

#[derive(Accounts)]
pub struct CloseMarket<'info> {
    #[account(
        mut,
        has_one = admin,
        seeds = [b"market", market.league_name.as_bytes(), market.season.as_bytes()],
        bump = market.bump,
        close = admin
    )]
    pub market: Account<'info, Market>,

    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = market,
        associated_token::token_program = token_program
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = admin,
        associated_token::token_program = token_program
    )]
    pub admin_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub token_program: Program<'info, Token>,

    pub associated_token_program: Program<'info, AssociatedToken>,

    pub system_program: Program<'info, System>,
}

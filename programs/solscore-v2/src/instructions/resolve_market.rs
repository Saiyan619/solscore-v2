use anchor_lang::prelude::*;

use crate::error::SolscoreError;

use crate::state::{Bet, Market};

pub fn _resolve_market(ctx: Context<ResolveMarket>, winning_team_index: u8) -> Result<()> {
    let market = &mut ctx.accounts.market;

    require!(
        (winning_team_index as usize) < market.teams.len(),
        SolscoreError::InvalidTeamIndex
    );
    require!(!market.is_resolved, SolscoreError::MarketResolved);

    market.is_resolved = true;
    market.winning_team_index = Some(winning_team_index);
    market.resolved_at = Some(Clock::get()?.unix_timestamp);

    msg!(
        "Market resolved: Team {} wins {}",
        winning_team_index,
        market.teams[winning_team_index as usize]
    );

    Ok(())
}

#[derive(Accounts)]
pub struct ResolveMarket<'info> {
    #[account(
        mut,
        has_one = admin,
        seeds = [b"market", market.league_name.as_bytes(), market.season.as_bytes()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

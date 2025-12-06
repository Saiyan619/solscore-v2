pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use error::*;
pub use instructions::*;
pub use state::*;

declare_id!("D9xDTh7SMGKK2yQZABhQbNqQu9SoEpvpdEFUtkKe6A6u");

#[program]
pub mod solscore {
    use super::*;

    pub fn initialize_market(
        ctx: Context<InitializeMarket>,
        league_name: String,
        season: String,
        teams: Vec<String>,
        odds: Vec<u64>,
        max_stake_amount: u64,
        allowed_bettors: u64,
    ) -> Result<()> {
        _initialize_market(
            ctx,
            league_name,
            season,
            teams,
            odds,
            max_stake_amount,
            allowed_bettors,
        )
    }

    pub fn place_bet(ctx: Context<PlaceBet>, team_index: u8, amount: u64) -> Result<()> {
        _place_bet(ctx, team_index, amount)
    }

    pub fn close_market(ctx: Context<CloseMarket>) -> Result<()> {
        _close_market(ctx)
    }

    pub fn resolve_market(ctx: Context<ResolveMarket>, winning_team_index: u8) -> Result<()> {
        _resolve_market(ctx, winning_team_index)
    }

    pub fn claim_payout(ctx: Context<ClaimPayout>) -> Result<()> {
        _claim_payout(ctx)
    }
}

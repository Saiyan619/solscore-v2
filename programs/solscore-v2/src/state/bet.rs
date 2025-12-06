use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Bet {
    pub user: Pubkey,
    pub market: Pubkey,
    pub team_index: u8,
    pub amount: u64,
    pub payout_amount: Option<u64>,
    pub timestamp: i64,
    pub bump: u8,
}

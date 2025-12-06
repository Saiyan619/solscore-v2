use anchor_lang::prelude::*;

//Struct for market Pda
#[account]
#[derive(InitSpace)]
pub struct Market {
    pub admin: Pubkey,
    #[max_len(50)]
    pub league_name: String,
    #[max_len(20)]
    pub season: String,
    #[max_len(25, 50)]
    pub teams: Vec<String>,
    #[max_len(30)]
    pub odds: Vec<u64>,
    pub is_resolved: bool,
    pub winning_team_index: Option<u8>,
    pub max_stake_amount: u64,
    pub allowed_bettors: u64,
    pub resolved_at: Option<i64>,
    pub bump: u8,
}

use anchor_lang::prelude::*;

#[error_code]
pub enum SolscoreError {
    #[msg("Market teams and odds vectors must not be empty")]
    EmptyTeamsOrOdds,
    #[msg("Market teams and odds vectors must have the same length")]
    TeamsAndOddsLengthMismatch,
    #[msg("Market cannot accept any more bets")]
    MarketAllowedBettorsLimitExceeded,
    #[msg("Market has already been resolved")]
    MarketResolved,
    #[msg("Market has not been resolved")]
    MarketNotResolved,
    #[msg("Bet amount must be greater than zero and less than the market maximum stake amount")]
    InvalidBetAmount,
    #[msg("Bet team index does not match market winning team index")]
    BetNotWon,
    #[msg("Insufficient USDC balance")]
    InsufficientBalance,
    #[msg("Invalid team index")]
    InvalidTeamIndex,
    #[msg("Mathematical overflow")]
    MathOverflow,
    #[msg("Mathematical underflow")]
    MathUnderflow,
}
